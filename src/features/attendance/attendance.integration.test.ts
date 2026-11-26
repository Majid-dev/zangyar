import { config } from "dotenv";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  academicYears,
  attendanceRecords,
  attendanceSessions,
  classrooms,
  enrollments,
  grades,
  guardians,
  notificationOutbox,
  schoolMemberships,
  schoolOperatingDays,
  schoolPeriods,
  schoolSettings,
  schools,
  studentGuardians,
  students,
  subjects,
  teacherWeeklyHourRequirements,
  timetableEntries,
  users,
} from "@/lib/db/schema";
import { getTeacherHourReportForContext } from "@/features/scheduling/queries";
import { resolveApplicableShift, schoolDayOfWeek } from "@/features/scheduling/week";
import { submitAttendanceForContext } from "./services";

config({ path: ".env.local" });
const canRun = Boolean(process.env.DATABASE_URL && process.env.RUN_DB_INTEGRATION_TESTS === "1");

// 2026-11-21 is a Saturday, which is school weekday 1.
const SATURDAY = "2026-11-21";
const NEXT_SATURDAY = "2026-11-28";
// 2026-11-26 is a Thursday, which this school does not operate on.
const THURSDAY = "2026-11-26";

/**
 * A stored deadline as the school's local wall clock, `HH:MM`.
 *
 * The deadline is a real instant; what a teacher works to is the wall-clock time it
 * lands on in the school's zone, which is what the shift's period end plus the grace
 * period should produce. Reading it back through the same zone is what makes the
 * assertion about the schedule rather than about the instant.
 */
function formatSchoolDeadline(instant: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
}

describe.skipIf(!canRun)("persisted Phase 6 attendance", () => {
  let context: { membershipId: string; schoolId: string; userId: string; role: "SCHOOL_ADMIN"; school: typeof schools.$inferSelect };
  let classroomId: string;
  let enrollmentId: string;
  let guardianId: string;
  let teacherMembershipId: string;
  let partnerMembershipId: string;
  let periodOneId: string;
  let periodTwoId: string;
  const academicYearId = { value: "" };

  beforeAll(async () => {
    const db = getDb();
    const [school] = await db.insert(schools).values({ slug: `phase6-${crypto.randomUUID()}`, name: "Phase 6 School" }).returning();
    const userId = `phase6-user-${crypto.randomUUID()}`;
    await db.insert(users).values({ id: userId, name: "Phase 6 Admin", email: `${userId}@example.com`, emailVerified: true });
    const [membership] = await db.insert(schoolMemberships).values({ schoolId: school.id, userId, role: "SCHOOL_ADMIN", status: "ACTIVE" }).returning();
    const [year] = await db.insert(academicYears).values({ schoolId: school.id, code: "1405", name: "سال فعال", startDate: "2026-09-23", endDate: "2027-06-21", status: "ACTIVE" }).returning();
    academicYearId.value = year.id;
    const [grade] = await db.insert(grades).values({ schoolId: school.id, code: "G1", name: "پایه اول" }).returning();
    const [classroom] = await db.insert(classrooms).values({ schoolId: school.id, academicYearId: year.id, gradeId: grade.id, code: "A", name: "کلاس اول" }).returning();
    const [student] = await db.insert(students).values({ schoolId: school.id, admissionNumber: "1", firstName: "آرین", lastName: "احمدی" }).returning();
    const enrollment = await db.insert(enrollments).values({ schoolId: school.id, studentId: student.id, academicYearId: year.id, classroomId: classroom.id, startDate: "2026-09-23" }).returning();
    const [guardian] = await db.insert(guardians).values({ schoolId: school.id, firstName: "مریم", lastName: "احمدی", normalizedMobile: "09120000000" }).returning();
    await db.insert(studentGuardians).values({ schoolId: school.id, studentId: student.id, guardianId: guardian.id, relationshipType: "مادر", receivesSms: true });
    // A 30-minute window after each period, so the deadline is exercised rather
    // than left at the same instant the period ends.
    await db.insert(schoolSettings).values({ schoolId: school.id, notifyOnPresent: true, attendanceSubmissionMinutes: 30, shiftType: "MORNING" });
    const [subject] = await db.insert(subjects).values({ schoolId: school.id, code: "MATH", name: "ریاضی" }).returning();

    // Saturday through Wednesday, the school's operating week.
    await db.insert(schoolOperatingDays).values([1, 2, 3, 4, 5].map((dayOfWeek) => ({ schoolId: school.id, dayOfWeek })));
    const [periodOne] = await db.insert(schoolPeriods).values({ schoolId: school.id, ordinal: 1, startTime: "08:00:00", endTime: "10:00:00" }).returning();
    const [periodTwo] = await db.insert(schoolPeriods).values({ schoolId: school.id, ordinal: 2, startTime: "10:15:00", endTime: "12:15:00" }).returning();

    const teacherUser = `phase6-teacher-${crypto.randomUUID()}`;
    const partnerUser = `phase6-partner-${crypto.randomUUID()}`;
    await db.insert(users).values([
      { id: teacherUser, name: "دبیر اول", email: `${teacherUser}@example.com`, emailVerified: true },
      { id: partnerUser, name: "دبیر دوم", email: `${partnerUser}@example.com`, emailVerified: true },
    ]);
    const [teacherMembership] = await db.insert(schoolMemberships).values({ schoolId: school.id, userId: teacherUser, role: "TEACHER", status: "ACTIVE" }).returning();
    const [partnerMembership] = await db.insert(schoolMemberships).values({ schoolId: school.id, userId: partnerUser, role: "TEACHER", status: "ACTIVE" }).returning();
    await db.insert(teacherWeeklyHourRequirements).values([
      { schoolId: school.id, academicYearId: year.id, teacherMembershipId: teacherMembership.id, requiredWeeklyHours: 3 },
      { schoolId: school.id, academicYearId: year.id, teacherMembershipId: partnerMembership.id, requiredWeeklyHours: 1 },
    ]);

    // Period one is a full lesson: the same teacher and subject in both of the
    // period's hours. Period two is split — its first hour is the first teacher's,
    // its second the partner's, with a different subject — which is the shape that
    // has no single "the period's teacher" and no scope column to say so.
    await db.insert(timetableEntries).values({
      schoolId: school.id, academicYearId: year.id, classroomId: classroom.id, periodId: periodOne.id,
      dayOfWeek: 1, hourIndex: 1, subjectId: subject.id, teacherMembershipId: teacherMembership.id,
    }).returning();
    await db.insert(timetableEntries).values({
      schoolId: school.id, academicYearId: year.id, classroomId: classroom.id, periodId: periodOne.id,
      dayOfWeek: 1, hourIndex: 2, subjectId: subject.id, teacherMembershipId: teacherMembership.id,
    });
    await db.insert(timetableEntries).values({
      schoolId: school.id, academicYearId: year.id, classroomId: classroom.id, periodId: periodTwo.id,
      dayOfWeek: 1, hourIndex: 1, subjectId: subject.id, teacherMembershipId: teacherMembership.id,
    }).returning();
    const [secondSubject] = await db.insert(subjects).values({ schoolId: school.id, code: "SCI", name: "علوم" }).returning();
    await db.insert(timetableEntries).values({
      schoolId: school.id, academicYearId: year.id, classroomId: classroom.id, periodId: periodTwo.id,
      dayOfWeek: 1, hourIndex: 2, subjectId: secondSubject.id, teacherMembershipId: partnerMembership.id,
    });

    context = { membershipId: membership.id, schoolId: school.id, userId, role: "SCHOOL_ADMIN", school };
    classroomId = classroom.id;
    enrollmentId = enrollment[0].id;
    guardianId = guardian.id;
    teacherMembershipId = teacherMembership.id;
    partnerMembershipId = partnerMembership.id;
    periodOneId = periodOne.id;
    periodTwoId = periodTwo.id;
  });

  it("persists one period session, attendance record, and notification intent", async () => {
    await submitAttendanceForContext(context, { classroomId, periodId: periodOneId, businessDate: SATURDAY, records: [{ enrollmentId, status: "PRESENT" }] });
    const db = getDb();
    const sessions = await db.select().from(attendanceSessions).where(and(
      eq(attendanceSessions.schoolId, context.schoolId),
      eq(attendanceSessions.classroomId, classroomId),
      eq(attendanceSessions.periodId, periodOneId),
      eq(attendanceSessions.businessDate, SATURDAY),
    ));
    expect(sessions).toHaveLength(1);
    // The session names the period, the responsible teacher, and the shift the
    // school was actually in, so neither a report nor a past register has to
    // re-derive any of them. A period one teacher holds outright names them.
    expect(sessions[0]).toMatchObject({ teacherMembershipId, businessDate: SATURDAY, status: "OPEN", applicableShift: "MORNING" });
    expect(sessions[0].submissionDeadlineAt.getTime()).toBeGreaterThan(0);

    const [savedRecord] = await db.select().from(attendanceRecords).where(and(
      eq(attendanceRecords.schoolId, context.schoolId),
      eq(attendanceRecords.enrollmentId, enrollmentId),
    ));
    expect(savedRecord).toBeDefined();
    const [outbox] = await db.select().from(notificationOutbox).where(and(
      eq(notificationOutbox.schoolId, context.schoolId),
      eq(notificationOutbox.guardianId, guardianId),
    ));
    expect(outbox).toMatchObject({ eventType: "ATTENDANCE", attendanceRecordId: savedRecord.id, recipientMobile: "09120000000", policyDecision: true, status: "PENDING" });
    expect(outbox.message).toContain("ریاضی");
  });

  it("does not duplicate notification intent on repeated same-status submission", async () => {
    await submitAttendanceForContext(context, { classroomId, periodId: periodOneId, businessDate: SATURDAY, records: [{ enrollmentId, status: "PRESENT" }] });
    await submitAttendanceForContext(context, { classroomId, periodId: periodOneId, businessDate: SATURDAY, records: [{ enrollmentId, status: "PRESENT" }] });
    const outbox = await getDb().select().from(notificationOutbox).where(and(
      eq(notificationOutbox.schoolId, context.schoolId),
      eq(notificationOutbox.guardianId, guardianId),
    ));
    expect(outbox).toHaveLength(1);
  });

  it("keeps one register for a period, not one per hour", async () => {
    await submitAttendanceForContext(context, { classroomId, periodId: periodTwoId, businessDate: SATURDAY, records: [{ enrollmentId, status: "ABSENT" }] });
    const sessions = await getDb().select().from(attendanceSessions).where(and(
      eq(attendanceSessions.schoolId, context.schoolId),
      eq(attendanceSessions.classroomId, classroomId),
      eq(attendanceSessions.businessDate, SATURDAY),
    ));
    // Two periods of this class meet on Saturday and each is registered once, even
    // though period two holds two hours with two teachers and two subjects.
    expect(sessions).toHaveLength(2);
    const forSplit = sessions.filter((session) => session.periodId === periodTwoId);
    expect(forSplit).toHaveLength(1);
  });

  it("hands a split period to one teacher for the whole period, alternating weekly", async () => {
    const db = getDb();
    // The academic year opens on 2026-09-23, whose school week starts Saturday
    // 2026-09-19. The week of 2026-11-21 is nine weeks on — an odd index — so it is
    // the *second* teacher's week even though the first teacher holds the earlier
    // hour. The following week is the first teacher's.
    await submitAttendanceForContext(context, { classroomId, periodId: periodTwoId, businessDate: SATURDAY, records: [{ enrollmentId, status: "LATE" }] });
    const [oddWeek] = await db.select().from(attendanceSessions).where(and(
      eq(attendanceSessions.schoolId, context.schoolId),
      eq(attendanceSessions.classroomId, classroomId),
      eq(attendanceSessions.periodId, periodTwoId),
      eq(attendanceSessions.businessDate, SATURDAY),
    ));
    expect(oddWeek.teacherMembershipId).toBe(partnerMembershipId);

    await submitAttendanceForContext(context, { classroomId, periodId: periodTwoId, businessDate: NEXT_SATURDAY, records: [{ enrollmentId, status: "PRESENT" }] });
    const [evenWeek] = await db.select().from(attendanceSessions).where(and(
      eq(attendanceSessions.schoolId, context.schoolId),
      eq(attendanceSessions.classroomId, classroomId),
      eq(attendanceSessions.periodId, periodTwoId),
      eq(attendanceSessions.businessDate, NEXT_SATURDAY),
    ));
    expect(evenWeek.teacherMembershipId).toBe(teacherMembershipId);
  });

  it("refuses the other teacher of a split period in a week that is not theirs", async () => {
    // A teacher context for the first teacher, submitting the split period in a week
    // the rotation hands to the second teacher.
    const teacherContext = { ...context, membershipId: teacherMembershipId, role: "TEACHER" as const };
    await expect(submitAttendanceForContext(teacherContext, {
      classroomId, periodId: periodTwoId, businessDate: SATURDAY, records: [{ enrollmentId, status: "PRESENT" }],
    })).rejects.toThrow("دبیر مسئول همین هفته");
  });

  it("counts each assignment as one hour for its teacher", async () => {
    const report = await getTeacherHourReportForContext(context, academicYearId.value);
    const byTeacher = new Map(report.map((row) => [row.teacherMembershipId, row]));
    // Three hours name the first teacher (both hours of period one and the first of
    // period two) and one names the partner, which is one hour per assignment. The
    // weekly alternation of attendance responsibility does not move either figure:
    // a teacher's hours are what they teach, not what they register.
    expect(byTeacher.get(teacherMembershipId)).toMatchObject({ assignedWeeklyHours: 3, requiredWeeklyHours: 3, difference: 0 });
    expect(byTeacher.get(partnerMembershipId)).toMatchObject({ assignedWeeklyHours: 1, requiredWeeklyHours: 1, difference: 0 });
  });

  it("refuses attendance on a day the school does not operate", async () => {
    // Thursday is outside the configured Saturday-to-Wednesday week.
    expect(schoolDayOfWeek(THURSDAY)).toBe(6);
    await expect(submitAttendanceForContext(context, {
      classroomId, periodId: periodOneId, businessDate: THURSDAY, records: [{ enrollmentId, status: "PRESENT" }],
    })).rejects.toThrow("روزهای فعالیت");
  });

  it("refuses a date whose weekday the period is not scheduled on", async () => {
    // The entry is a Saturday period, so a Sunday date must not accept it even
    // though Sunday is an operating day. The refusal names the weekday, which is the
    // fact that explains it, rather than the school's calendar.
    expect(schoolDayOfWeek("2026-11-22")).toBe(2);
    await expect(submitAttendanceForContext(context, {
      classroomId, periodId: periodOneId, businessDate: "2026-11-22", records: [{ enrollmentId, status: "PRESENT" }],
    })).rejects.toThrow("برگزار نمی‌شود");
  });

  it("refuses a period from another school", async () => {
    const db = getDb();
    const [otherSchool] = await db.insert(schools).values({ slug: `phase6-other-${crypto.randomUUID()}`, name: "Other" }).returning();
    const [otherPeriod] = await db.insert(schoolPeriods).values({ schoolId: otherSchool.id, ordinal: 1, startTime: "08:00:00", endTime: "10:00:00" }).returning();

    // The period id belongs to another school, so it must not resolve to a slot
    // here — the service looks the period up within this school and finds nothing.
    await expect(submitAttendanceForContext(context, {
      classroomId, periodId: otherPeriod.id, businessDate: SATURDAY, records: [{ enrollmentId, status: "PRESENT" }],
    })).rejects.toThrow("در دسترس نیست");
  });

  it("resolves the applicable shift for a rotating school week by week", () => {
    const rotating = { shiftType: "ROTATING" as const, rotationBaseDate: SATURDAY };
    expect(resolveApplicableShift(SATURDAY, rotating)).toBe("MORNING");
    expect(resolveApplicableShift(NEXT_SATURDAY, rotating)).toBe("AFTERNOON");
    // A fixed school never alternates.
    expect(resolveApplicableShift(SATURDAY, { shiftType: "AFTERNOON", rotationBaseDate: null })).toBe("AFTERNOON");
  });

  it("resolves the applicable shift for a rotating school week by week", () => {
    const rotating = { shiftType: "ROTATING" as const, rotationBaseDate: SATURDAY };
    expect(resolveApplicableShift(SATURDAY, rotating)).toBe("MORNING");
    expect(resolveApplicableShift(NEXT_SATURDAY, rotating)).toBe("AFTERNOON");
    // A fixed school never alternates.
    expect(resolveApplicableShift(SATURDAY, { shiftType: "AFTERNOON", rotationBaseDate: null })).toBe("AFTERNOON");
  });

  it("measures a rotating school's deadline from the afternoon schedule in an afternoon week", async () => {
    // A school that rotates needs its own fixtures: two shifts' times on the period,
    // and the rotation anchored so the week under test is the afternoon one.
    const db = getDb();
    const [rotatingSchool] = await db.insert(schools).values({ slug: `phase6-rotating-${crypto.randomUUID()}`, name: "Rotating" }).returning();
    const rotatingUserId = `phase6-rotating-admin-${crypto.randomUUID()}`;
    await db.insert(users).values({ id: rotatingUserId, name: "مدیر چرخشی", email: `${rotatingUserId}@example.com`, emailVerified: true });
    const [rotatingMembership] = await db.insert(schoolMemberships).values({ schoolId: rotatingSchool.id, userId: rotatingUserId, role: "SCHOOL_ADMIN", status: "ACTIVE" }).returning();
    const [rotatingYear] = await db.insert(academicYears).values({ schoolId: rotatingSchool.id, code: "1405", name: "سال چرخشی", startDate: "2026-09-23", endDate: "2027-06-21", status: "ACTIVE" }).returning();
    const [rotatingGrade] = await db.insert(grades).values({ schoolId: rotatingSchool.id, code: "G1", name: "پایه" }).returning();
    const [rotatingClassroom] = await db.insert(classrooms).values({ schoolId: rotatingSchool.id, academicYearId: rotatingYear.id, gradeId: rotatingGrade.id, code: "A", name: "کلاس" }).returning();
    const [rotatingStudent] = await db.insert(students).values({ schoolId: rotatingSchool.id, admissionNumber: "1", firstName: "رها", lastName: "چرخشی" }).returning();
    const [rotatingEnrollment] = await db.insert(enrollments).values({ schoolId: rotatingSchool.id, studentId: rotatingStudent.id, academicYearId: rotatingYear.id, classroomId: rotatingClassroom.id, startDate: "2026-09-23" }).returning();
    await db.insert(schoolOperatingDays).values([1, 2, 3, 4, 5].map((dayOfWeek) => ({ schoolId: rotatingSchool.id, dayOfWeek })));
    // Noon opening, late-afternoon closing: the pair the deadline must follow.
    await db.insert(schoolSettings).values({ schoolId: rotatingSchool.id, attendanceSubmissionMinutes: 30, shiftType: "ROTATING", rotationBaseDate: SATURDAY });
    const [rotatingPeriod] = await db.insert(schoolPeriods).values({
      schoolId: rotatingSchool.id, ordinal: 1, startTime: "07:00:00", endTime: "09:00:00",
      afternoonStartTime: "14:00:00", afternoonEndTime: "16:00:00",
    }).returning();
    const rotatingSubject = (await db.insert(subjects).values({ schoolId: rotatingSchool.id, code: "MATH", name: "ریاضی" }).returning())[0];
    const rotatingTeacherUser = `phase6-rotating-teacher-${crypto.randomUUID()}`;
    await db.insert(users).values({ id: rotatingTeacherUser, name: "دبیر چرخشی", email: `${rotatingTeacherUser}@example.com`, emailVerified: true });
    const [rotatingTeacher] = await db.insert(schoolMemberships).values({ schoolId: rotatingSchool.id, userId: rotatingTeacherUser, role: "TEACHER", status: "ACTIVE" }).returning();
    await db.insert(timetableEntries).values([
      { schoolId: rotatingSchool.id, academicYearId: rotatingYear.id, classroomId: rotatingClassroom.id, periodId: rotatingPeriod.id, dayOfWeek: 1, hourIndex: 1, subjectId: rotatingSubject.id, teacherMembershipId: rotatingTeacher.id },
      { schoolId: rotatingSchool.id, academicYearId: rotatingYear.id, classroomId: rotatingClassroom.id, periodId: rotatingPeriod.id, dayOfWeek: 1, hourIndex: 2, subjectId: rotatingSubject.id, teacherMembershipId: rotatingTeacher.id },
    ]);
    const rotatingContext = { membershipId: rotatingMembership.id, schoolId: rotatingSchool.id, userId: rotatingUserId, role: "SCHOOL_ADMIN" as const, school: rotatingSchool };

    // NEXT_SATURDAY is an afternoon week for this anchor, so the period ends at 16:00
    // and the deadline lands 30 minutes later — not the 09:30 the morning pair would
    // have produced.
    await submitAttendanceForContext(rotatingContext, {
      classroomId: rotatingClassroom.id, periodId: rotatingPeriod.id, businessDate: NEXT_SATURDAY,
      records: [{ enrollmentId: rotatingEnrollment.id, status: "PRESENT" }],
    });
    const [afternoonSession] = await db.select().from(attendanceSessions).where(and(
      eq(attendanceSessions.schoolId, rotatingSchool.id),
      eq(attendanceSessions.periodId, rotatingPeriod.id),
      eq(attendanceSessions.businessDate, NEXT_SATURDAY),
    ));
    expect(afternoonSession.applicableShift).toBe("AFTERNOON");
    expect(formatSchoolDeadline(afternoonSession.submissionDeadlineAt, rotatingSchool.timezone)).toBe("16:30");

    // The morning week's register, by contrast, follows the morning pair.
    await submitAttendanceForContext(rotatingContext, {
      classroomId: rotatingClassroom.id, periodId: rotatingPeriod.id, businessDate: SATURDAY,
      records: [{ enrollmentId: rotatingEnrollment.id, status: "PRESENT" }],
    });
    const [morningSession] = await db.select().from(attendanceSessions).where(and(
      eq(attendanceSessions.schoolId, rotatingSchool.id),
      eq(attendanceSessions.periodId, rotatingPeriod.id),
      eq(attendanceSessions.businessDate, SATURDAY),
    ));
    expect(morningSession.applicableShift).toBe("MORNING");
    expect(formatSchoolDeadline(morningSession.submissionDeadlineAt, rotatingSchool.timezone)).toBe("09:30");
  });

  it("keeps the school week numbering the timetable is built on", () => {
    expect(schoolDayOfWeek(SATURDAY)).toBe(1);
    expect(schoolDayOfWeek(NEXT_SATURDAY)).toBe(1);
  });

  it("keeps the configured periods in ordinal order", async () => {
    const db = getDb();
    const periods = await db.select().from(schoolPeriods).where(eq(schoolPeriods.schoolId, context.schoolId));
    expect(periods.map((period) => period.ordinal).sort((left, right) => left - right)).toEqual([1, 2]);
    expect(periodOneId).toBe(periods[0].id);
    expect(periodTwoId).toBe(periods[1].id);
  });
});
