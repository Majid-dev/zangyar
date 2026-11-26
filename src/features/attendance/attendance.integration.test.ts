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

describe.skipIf(!canRun)("persisted Phase 6 attendance", () => {
  let context: { membershipId: string; schoolId: string; userId: string; role: "SCHOOL_ADMIN"; school: typeof schools.$inferSelect };
  let classroomId: string;
  let enrollmentId: string;
  let guardianId: string;
  let subjectId: string;
  let teacherMembershipId: string;
  let partnerMembershipId: string;
  let periodOneId: string;
  let periodTwoId: string;
  let timetableEntryId: string;
  let splitEntryId: string;
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
    const [entry] = await db.insert(timetableEntries).values({
      schoolId: school.id, academicYearId: year.id, classroomId: classroom.id, periodId: periodOne.id,
      dayOfWeek: 1, hourIndex: 1, subjectId: subject.id, teacherMembershipId: teacherMembership.id,
    }).returning();
    await db.insert(timetableEntries).values({
      schoolId: school.id, academicYearId: year.id, classroomId: classroom.id, periodId: periodOne.id,
      dayOfWeek: 1, hourIndex: 2, subjectId: subject.id, teacherMembershipId: teacherMembership.id,
    });
    const [split] = await db.insert(timetableEntries).values({
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
    subjectId = subject.id;
    teacherMembershipId = teacherMembership.id;
    partnerMembershipId = partnerMembership.id;
    periodOneId = periodOne.id;
    periodTwoId = periodTwo.id;
    timetableEntryId = entry.id;
    splitEntryId = split.id;
  });

  it("persists one period session, attendance record, and notification intent", async () => {
    await submitAttendanceForContext(context, { timetableEntryId, businessDate: SATURDAY, records: [{ enrollmentId, status: "PRESENT" }] });
    const db = getDb();
    const sessions = await db.select().from(attendanceSessions).where(and(
      eq(attendanceSessions.schoolId, context.schoolId),
      eq(attendanceSessions.timetableEntryId, timetableEntryId),
    ));
    expect(sessions).toHaveLength(1);
    // The session names the subject, the responsible teacher, and the shift the
    // school was actually in, so neither a report nor a past register has to
    // re-derive any of them.
    expect(sessions[0]).toMatchObject({ subjectId, teacherMembershipId, businessDate: SATURDAY, status: "OPEN", applicableShift: "MORNING" });
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
    await submitAttendanceForContext(context, { timetableEntryId, businessDate: SATURDAY, records: [{ enrollmentId, status: "PRESENT" }] });
    await submitAttendanceForContext(context, { timetableEntryId, businessDate: SATURDAY, records: [{ enrollmentId, status: "PRESENT" }] });
    const outbox = await getDb().select().from(notificationOutbox).where(and(
      eq(notificationOutbox.schoolId, context.schoolId),
      eq(notificationOutbox.guardianId, guardianId),
    ));
    expect(outbox).toHaveLength(1);
  });

  it("keeps one session per teaching hour", async () => {
    await submitAttendanceForContext(context, { timetableEntryId: splitEntryId, businessDate: SATURDAY, records: [{ enrollmentId, status: "ABSENT" }] });
    const sessions = await getDb().select().from(attendanceSessions).where(and(
      eq(attendanceSessions.schoolId, context.schoolId),
      eq(attendanceSessions.classroomId, classroomId),
      eq(attendanceSessions.businessDate, SATURDAY),
    ));
    // Each teaching hour is its own register, so the two hours of one period are
    // two sessions — which is what a period-level model could not express.
    expect(sessions).toHaveLength(2);
  });

  it("records the subject and teacher of the hour that was registered", async () => {
    const db = getDb();
    // The split period's second hour belongs to the partner teacher and a different
    // subject, so its register must name those rather than the period's first hour's.
    const [secondHour] = await db.select().from(timetableEntries).where(and(
      eq(timetableEntries.classroomId, classroomId),
      eq(timetableEntries.periodId, periodTwoId),
      eq(timetableEntries.hourIndex, 2),
    ));
    await submitAttendanceForContext(context, { timetableEntryId: secondHour.id, businessDate: SATURDAY, records: [{ enrollmentId, status: "LATE" }] });
    const [session] = await db.select().from(attendanceSessions).where(and(
      eq(attendanceSessions.schoolId, context.schoolId),
      eq(attendanceSessions.timetableEntryId, secondHour.id),
      eq(attendanceSessions.businessDate, SATURDAY),
    ));
    expect(session.teacherMembershipId).toBe(partnerMembershipId);
    expect(session.subjectId).toBe(secondHour.subjectId);
  });

  it("counts each assignment as one hour for its teacher", async () => {
    const report = await getTeacherHourReportForContext(context, academicYearId.value);
    const byTeacher = new Map(report.map((row) => [row.teacherMembershipId, row]));
    // Three hours name the first teacher (both hours of period one and the first of
    // period two) and one names the partner, which is one hour per assignment.
    expect(byTeacher.get(teacherMembershipId)).toMatchObject({ assignedWeeklyHours: 3, requiredWeeklyHours: 3, difference: 0 });
    expect(byTeacher.get(partnerMembershipId)).toMatchObject({ assignedWeeklyHours: 1, requiredWeeklyHours: 1, difference: 0 });
  });

  it("refuses attendance on a day the school does not operate", async () => {
    // Thursday is outside the configured Saturday-to-Wednesday week.
    expect(schoolDayOfWeek(THURSDAY)).toBe(6);
    await expect(submitAttendanceForContext(context, {
      timetableEntryId, businessDate: THURSDAY, records: [{ enrollmentId, status: "PRESENT" }],
    })).rejects.toThrow("روزهای فعالیت");
  });

  it("refuses a date whose weekday does not match the entry", async () => {
    // The entry is a Saturday period, so a Sunday date must not accept it even
    // though Sunday is an operating day.
    expect(schoolDayOfWeek("2026-11-22")).toBe(2);
    await expect(submitAttendanceForContext(context, {
      timetableEntryId, businessDate: "2026-11-22", records: [{ enrollmentId, status: "PRESENT" }],
    })).rejects.toThrow("برگزار نمی‌شود");
  });

  it("refuses an entry from another school", async () => {
    const db = getDb();
    const [otherSchool] = await db.insert(schools).values({ slug: `phase6-other-${crypto.randomUUID()}`, name: "Other" }).returning();
    const [otherYear] = await db.insert(academicYears).values({ schoolId: otherSchool.id, code: "1405", name: "سال دیگر", startDate: "2026-09-23", endDate: "2027-06-21", status: "ACTIVE" }).returning();
    const [otherGrade] = await db.insert(grades).values({ schoolId: otherSchool.id, code: "G1", name: "پایه" }).returning();
    const [otherClassroom] = await db.insert(classrooms).values({ schoolId: otherSchool.id, academicYearId: otherYear.id, gradeId: otherGrade.id, code: "A", name: "کلاس" }).returning();
    const [otherPeriod] = await db.insert(schoolPeriods).values({ schoolId: otherSchool.id, ordinal: 1, startTime: "08:00:00", endTime: "10:00:00" }).returning();
    const [otherTeacherUser] = await db.insert(users).values({ id: `phase6-foreign-${crypto.randomUUID()}`, name: "دبیر دیگر", email: `foreign-${crypto.randomUUID()}@example.com`, emailVerified: true }).returning();
    const [otherMembership] = await db.insert(schoolMemberships).values({ schoolId: otherSchool.id, userId: otherTeacherUser.id, role: "TEACHER", status: "ACTIVE" }).returning();
    const [otherSubject] = await db.insert(subjects).values({ schoolId: otherSchool.id, code: "MATH", name: "ریاضی" }).returning();
    const [foreignEntry] = await db.insert(timetableEntries).values({
      schoolId: otherSchool.id, academicYearId: otherYear.id, classroomId: otherClassroom.id, periodId: otherPeriod.id,
      dayOfWeek: 1, hourIndex: 1, subjectId: otherSubject.id, teacherMembershipId: otherMembership.id,
    }).returning();

    await expect(submitAttendanceForContext(context, {
      timetableEntryId: foreignEntry.id, businessDate: SATURDAY, records: [{ enrollmentId, status: "PRESENT" }],
    })).rejects.toThrow("در دسترس نیست");
  });

  it("resolves the applicable shift for a rotating school week by week", () => {
    const rotating = { shiftType: "ROTATING" as const, rotationBaseDate: SATURDAY };
    expect(resolveApplicableShift(SATURDAY, rotating)).toBe("MORNING");
    expect(resolveApplicableShift(NEXT_SATURDAY, rotating)).toBe("AFTERNOON");
    // A fixed school never alternates.
    expect(resolveApplicableShift(SATURDAY, { shiftType: "AFTERNOON", rotationBaseDate: null })).toBe("AFTERNOON");
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
