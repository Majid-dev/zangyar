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
import { getAttendanceWorkspaceForContext, listAttendanceSlotsForContext } from "./queries";
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

  it("registers a period that meets on more than one weekday, on the right one", async () => {
    // Period one also meets on Sunday, which is operating day 2, taught by a third
    // teacher. Its rows therefore carry two weekdays under one period id, and the
    // register for either must be built from that day's rows: reading the period's
    // rows by hour alone would put Saturday's row first and refuse Sunday as a
    // weekday mismatch against a day the period does meet on.
    const db = getDb();
    const sundayUser = `phase6-sunday-${crypto.randomUUID()}`;
    await db.insert(users).values({ id: sundayUser, name: "دبیر یک‌شنبه", email: `${sundayUser}@example.com`, emailVerified: true });
    const [sundayTeacher] = await db.insert(schoolMemberships).values({ schoolId: context.schoolId, userId: sundayUser, role: "TEACHER", status: "ACTIVE" }).returning();
    await db.insert(teacherWeeklyHourRequirements).values({ schoolId: context.schoolId, academicYearId: academicYearId.value, teacherMembershipId: sundayTeacher.id, requiredWeeklyHours: 1 });
    const [sundaySubject] = await db.insert(subjects).values({ schoolId: context.schoolId, code: `SUN-${crypto.randomUUID().slice(0, 6)}`, name: "نگارش" }).returning();
    // Sunday (2), both hours, a different subject and teacher from Saturday's.
    await db.insert(timetableEntries).values([1, 2].map((hourIndex) => ({
      schoolId: context.schoolId, academicYearId: academicYearId.value, classroomId, periodId: periodOneId,
      dayOfWeek: 2, hourIndex, subjectId: sundaySubject.id, teacherMembershipId: sundayTeacher.id,
    })));

    const SUNDAY = "2026-11-22";
    expect(schoolDayOfWeek(SUNDAY)).toBe(2);
    await submitAttendanceForContext(context, {
      classroomId, periodId: periodOneId, businessDate: SUNDAY, records: [{ enrollmentId, status: "PRESENT" }],
    });
    const [session] = await db.select().from(attendanceSessions).where(and(
      eq(attendanceSessions.schoolId, context.schoolId),
      eq(attendanceSessions.classroomId, classroomId),
      eq(attendanceSessions.periodId, periodOneId),
      eq(attendanceSessions.businessDate, SUNDAY),
    ));
    // The session names the Sunday teacher, not the Saturday one: the day's own rows
    // are what decided it.
    expect(session.teacherMembershipId).toBe(sundayTeacher.id);
    // And the notification names the Sunday lesson, not the Saturday one.
    const [outbox] = await db.select().from(notificationOutbox).where(and(
      eq(notificationOutbox.schoolId, context.schoolId),
      eq(notificationOutbox.attendanceRecordId, (await db.select().from(attendanceRecords).where(and(
        eq(attendanceRecords.schoolId, context.schoolId),
        eq(attendanceRecords.attendanceSessionId, session.id),
      )))[0].id),
    ));
    expect(outbox.message).toContain("نگارش");
  });

  it("refuses a period from another school", async () => {    const db = getDb();
    const [otherSchool] = await db.insert(schools).values({ slug: `phase6-other-${crypto.randomUUID()}`, name: "Other" }).returning();
    const [otherPeriod] = await db.insert(schoolPeriods).values({ schoolId: otherSchool.id, ordinal: 1, startTime: "08:00:00", endTime: "10:00:00" }).returning();

    // The period id belongs to another school, so it must not resolve to a slot
    // here — the service looks the period up within this school and finds nothing.
    await expect(submitAttendanceForContext(context, {
      classroomId, periodId: otherPeriod.id, businessDate: SATURDAY, records: [{ enrollmentId, status: "PRESENT" }],
    })).rejects.toThrow("در دسترس نیست");
  });

  it("refuses a teacher before the period begins", async () => {
    const teacherContext = { ...context, membershipId: teacherMembershipId, role: "TEACHER" as const };
    // Period one runs 08:00–10:00 school-local, which is 04:30Z on this date; asking
    // an hour earlier is a register for a period that has not happened.
    await expect(submitAttendanceForContext(teacherContext, {
      classroomId, periodId: periodOneId, businessDate: SATURDAY, records: [{ enrollmentId, status: "PRESENT" }],
    }, { now: new Date("2026-11-21T03:30:00.000Z") })).rejects.toThrow("هنوز آغاز نشده");
  });

  it("refuses a teacher past the submission deadline", async () => {
    const teacherContext = { ...context, membershipId: teacherMembershipId, role: "TEACHER" as const };
    // 10:00 end plus the 30-minute window is 07:00Z; a minute later the teacher is out
    // of time even though the period itself was theirs.
    await expect(submitAttendanceForContext(teacherContext, {
      classroomId, periodId: periodOneId, businessDate: SATURDAY, records: [{ enrollmentId, status: "PRESENT" }],
    }, { now: new Date("2026-11-21T07:01:00.000Z") })).rejects.toThrow("مهلت");
  });

  it("lets a School Admin correct a period whose window has closed", async () => {
    // The same occurrence the teacher was just refused, days later: correcting the
    // record is the admin's job (ADR-007), so the deadline does not bind them.
    await submitAttendanceForContext(context, {
      classroomId, periodId: periodOneId, businessDate: SATURDAY, records: [{ enrollmentId, status: "ABSENT" }],
    }, { now: new Date("2026-11-25T09:00:00.000Z") });
    const [corrected] = await getDb().select().from(attendanceRecords).where(and(
      eq(attendanceRecords.schoolId, context.schoolId),
      eq(attendanceRecords.enrollmentId, enrollmentId),
    ));
    expect(corrected.status).toBe("ABSENT");
  });

  it("tags a record the administrator changed, and leaves a first submission untagged", async () => {
    const db = getDb();
    // A day of its own, so this test's records cannot be confused with another's: the
    // enrollment has one record per session per period, and several tests share it.
    const day = "2026-12-05";
    const recordFor = async () => {
      const [session] = await db.select().from(attendanceSessions).where(and(
        eq(attendanceSessions.schoolId, context.schoolId),
        eq(attendanceSessions.classroomId, classroomId),
        eq(attendanceSessions.periodId, periodOneId),
        eq(attendanceSessions.businessDate, day),
      ));
      const [row] = await db.select().from(attendanceRecords).where(and(
        eq(attendanceRecords.schoolId, context.schoolId),
        eq(attendanceRecords.attendanceSessionId, session.id),
        eq(attendanceRecords.enrollmentId, enrollmentId),
      ));
      return row;
    };

    // The admin takes the register for this day when nothing is on record. A first
    // submission is not an edit, so there is nothing to disclose.
    await submitAttendanceForContext(context, {
      classroomId, periodId: periodOneId, businessDate: day, records: [{ enrollmentId, status: "PRESENT" }],
    }, { now: new Date("2026-12-05T05:00:00.000Z") });
    const asSubmitted = await recordFor();
    expect(asSubmitted.adminEditedAt).toBeNull();
    expect(asSubmitted.adminEditedByMembershipId).toBeNull();

    // The admin changes the status later. Now it is an edit, and it is tagged.
    await submitAttendanceForContext(context, {
      classroomId, periodId: periodOneId, businessDate: day, records: [{ enrollmentId, status: "LATE" }],
    }, { now: new Date("2026-12-06T09:00:00.000Z") });
    const edited = await recordFor();
    expect(edited.status).toBe("LATE");
    expect(edited.adminEditedAt).not.toBeNull();
    expect(edited.adminEditedByMembershipId).toBe(context.membershipId);
    // The original recorder is preserved: an edit does not rewrite who took it.
    expect(edited.recordedByMembershipId).toBe(context.membershipId);
  });

  it("keeps the administrator-edit tag across later edits, stamped with the first one", async () => {
    const day = "2026-12-05";
    const db = getDb();
    const [session] = await db.select().from(attendanceSessions).where(and(
      eq(attendanceSessions.schoolId, context.schoolId),
      eq(attendanceSessions.classroomId, classroomId),
      eq(attendanceSessions.periodId, periodOneId),
      eq(attendanceSessions.businessDate, day),
    ));
    const [before] = await db.select().from(attendanceRecords).where(and(
      eq(attendanceRecords.schoolId, context.schoolId),
      eq(attendanceRecords.attendanceSessionId, session.id),
      eq(attendanceRecords.enrollmentId, enrollmentId),
    ));
    const firstStamp = before.adminEditedAt?.toISOString();
    expect(firstStamp).not.toBeUndefined();

    // A further edit leaves the tag set rather than rewriting it to this edit's time.
    await submitAttendanceForContext(context, {
      classroomId, periodId: periodOneId, businessDate: day, records: [{ enrollmentId, status: "PRESENT" }],
    }, { now: new Date("2026-12-07T09:00:00.000Z") });

    const [after] = await db.select().from(attendanceRecords).where(and(
      eq(attendanceRecords.schoolId, context.schoolId),
      eq(attendanceRecords.attendanceSessionId, session.id),
      eq(attendanceRecords.enrollmentId, enrollmentId),
    ));
    expect(after.status).toBe("PRESENT");
    expect(after.adminEditedAt?.toISOString()).toBe(firstStamp);
    expect(after.adminEditedByMembershipId).toBe(context.membershipId);
  });

  it("names the teacher who takes a split period next week, not the one holding it now", async () => {
    // SATURDAY is the partner's week for split period two (an odd week index from the
    // year's start), so the teacher holding it is the partner and the one who takes it
    // next week is the base teacher. Reporting `teacherIds[1]` as the successor would
    // name the partner — the reader themselves.
    const slots = await listAttendanceSlotsForContext(context, SATURDAY);
    const split = slots.find((slot) => slot.periodId === periodTwoId);
    expect(split?.rotates).toBe(true);
    expect(split?.teacherMembershipId).toBe(partnerMembershipId);
    expect(split?.nextWeekTeacherMembershipId).toBe(teacherMembershipId);
    expect(split?.nextWeekTeacherMembershipId).not.toBe(split?.teacherMembershipId);
  });

  it("filters the day's occurrences by class, period, and submission status", async () => {
    const all = await getAttendanceWorkspaceForContext(context, { businessDate: SATURDAY });
    // The unfiltered day offers both classes and both periods as filter options.
    expect(all.filterOptions.classrooms.length).toBeGreaterThan(0);
    expect(all.filterOptions.periods.map((period) => period.id).sort()).toEqual([periodOneId, periodTwoId].sort());

    const byPeriod = await getAttendanceWorkspaceForContext(context, { businessDate: SATURDAY, periodId: periodTwoId });
    expect(byPeriod.slots.every((slot) => slot.periodId === periodTwoId)).toBe(true);
    expect(byPeriod.slots.length).toBe(1);
    // The pickers still describe the whole day, so choosing a filter cannot make the
    // class you were about to pick disappear from the list.
    expect(byPeriod.filterOptions.periods).toHaveLength(2);
    expect(byPeriod.totalSlotCount).toBe(all.slots.length);

    // A submission-status filter narrows to occurrences in that state. Both periods of
    // this day have been registered by earlier tests, so "submitted" is non-empty and
    // "upcoming" (nothing scheduled before its bell on a past date) is empty.
    const submitted = await getAttendanceWorkspaceForContext(context, { businessDate: SATURDAY, submissionStatus: "SUBMITTED" });
    expect(submitted.slots.every((slot) => slot.sessionId !== null)).toBe(true);
    const upcoming = await getAttendanceWorkspaceForContext(context, { businessDate: SATURDAY, submissionStatus: "UPCOMING" });
    expect(upcoming.slots).toHaveLength(0);

    // The filters intersect: a class that does not meet this period yields nothing.
    const impossible = await getAttendanceWorkspaceForContext(context, { businessDate: SATURDAY, periodId: periodTwoId, submissionStatus: "UPCOMING" });
    expect(impossible.slots).toHaveLength(0);
  });

  it("opens one grade by default and scopes the class list to it", async () => {
    const db = getDb();
    // A second grade with its own class and period, so the scope has something to
    // exclude: with one grade in the school the test could not tell a working scope
    // from an absent one.
    const [secondGrade] = await db.insert(grades).values({ schoolId: context.schoolId, code: "G2", name: "پایه دوم", sortOrder: 2 }).returning();
    const [secondClassroom] = await db.insert(classrooms).values({
      schoolId: context.schoolId, academicYearId: academicYearId.value, gradeId: secondGrade.id, code: "B", name: "کلاس دوم",
    }).returning();
    await db.insert(timetableEntries).values({
      schoolId: context.schoolId, academicYearId: academicYearId.value, classroomId: secondClassroom.id, periodId: periodOneId,
      dayOfWeek: 1, hourIndex: 1, subjectId: (await db.select().from(subjects).where(and(eq(subjects.schoolId, context.schoolId), eq(subjects.code, "MATH"))))[0].id,
      teacherMembershipId,
    });

    const scoped = await getAttendanceWorkspaceForContext(context, { businessDate: SATURDAY, gradeId: secondGrade.id });
    // The chosen grade's own occurrences only, and the class picker offers only that
    // grade's classes — a class from another grade would be a choice the scope excludes.
    expect(scoped.slots.length).toBeGreaterThan(0);
    expect(scoped.slots.every((slot) => slot.gradeId === secondGrade.id)).toBe(true);
    expect(scoped.filterOptions.classrooms.map((classroom) => classroom.id)).toEqual([secondClassroom.id]);
    // The grade picker still lists every grade the day holds, so the scope is not a
    // dead end once it has been narrowed.
    expect(scoped.filterOptions.grades.map((grade) => grade.id)).toContain(secondGrade.id);
    expect(scoped.gradeScopeId).toBe(secondGrade.id);

    // A grade with no classes today produces an empty list and no occurrences at all,
    // which is what the "no classes in this grade" empty state is drawn from.
    const [emptyGrade] = await db.insert(grades).values({ schoolId: context.schoolId, code: "G9", name: "پایه نهم", sortOrder: 9 }).returning();
    const empty = await getAttendanceWorkspaceForContext(context, { businessDate: SATURDAY, gradeId: emptyGrade.id });
    expect(empty.slots).toHaveLength(0);
    expect(empty.totalSlotCount).toBe(0);
    // The day itself is not empty, which is what lets the page say "this grade" rather
    // than "this date".
    expect(empty.daySlotCount).toBeGreaterThan(0);

    // An unset grade resolves to the school's own first grade rather than to all of
    // them, so the workspace always has exactly one scope.
    const unscoped = await getAttendanceWorkspaceForContext(context, { businessDate: SATURDAY });
    expect(unscoped.gradeScopeId).not.toBeNull();
    expect(unscoped.slots.every((slot) => slot.gradeId === unscoped.gradeScopeId)).toBe(true);
  });

  it("opens a chosen register without letting the choice become a filter", async () => {
    // Opening a card names one occurrence. It must not narrow the listing, or the
    // list would come back describing only the card that was just clicked and the
    // administrator would have lost the day they were browsing.
    const all = await getAttendanceWorkspaceForContext(context, { businessDate: SATURDAY });
    const target = all.slots.find((slot) => slot.periodId === periodTwoId);
    expect(target).toBeDefined();

    const opened = await getAttendanceWorkspaceForContext(context, {
      businessDate: SATURDAY,
      openSlotKey: `${target!.classroomId}:${target!.periodId}`,
    });
    expect(opened.slot?.periodId).toBe(periodTwoId);
    // The list is unchanged: every occurrence the day had is still listed.
    expect(opened.slots.length).toBe(all.slots.length);

    // A key that names nothing listed opens nothing rather than falling back to the
    // first occurrence, which would silently show a different register than the one
    // asked for.
    const missing = await getAttendanceWorkspaceForContext(context, {
      businessDate: SATURDAY,
      openSlotKey: "00000000-0000-0000-0000-000000000000:00000000-0000-0000-0000-000000000000",
    });
    expect(missing.slot).toBeNull();
    expect(missing.slots.length).toBe(all.slots.length);
  });

  it("narrows today's schedule to the periods in session, and widens on request", async () => {
    // A fixed clock inside period one's window: 08:00–10:00 Tehran is 04:30–06:30Z.
    // Only `Date` is faked, not the timer queue: the database driver schedules on
    // timers, and faking those as well would stall the queries this test is about.
    const duringPeriodOne = new Date("2026-11-21T05:00:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(duringPeriodOne);
      const active = await getAttendanceWorkspaceForContext(context, { businessDate: SATURDAY, onlyActivePeriod: true });
      // Period one is in session; period two, which runs 10:15–12:15, has not begun.
      expect(active.slots.length).toBeGreaterThan(0);
      expect(active.slots.every((slot) => slot.periodId === periodOneId)).toBe(true);
      expect(active.activeOnly).toBe(true);
      expect(active.activeSlotCount).toBe(active.slots.length);

      // The same instant without the narrowing lists the whole day.
      const whole = await getAttendanceWorkspaceForContext(context, { businessDate: SATURDAY });
      expect(whole.slots.length).toBeGreaterThan(active.slots.length);
      expect(whole.activeOnly).toBe(false);

      // Between the periods nothing is in session, and the count says so — which is
      // what the empty state reads to distinguish "nothing now" from "nothing today".
      // Period one ends at 10:00 Tehran (06:30Z) and period two begins at 10:15 (06:45Z),
      // so 06:35Z falls in the gap and in neither period's window.
      vi.setSystemTime(new Date("2026-11-21T06:35:00.000Z"));
      const between = await getAttendanceWorkspaceForContext(context, { businessDate: SATURDAY, onlyActivePeriod: true });
      expect(between.slots).toHaveLength(0);
      expect(between.activeSlotCount).toBe(0);
      // The day is not empty, so the page says "no class in session", not "no schedule".
      expect(between.totalSlotCount).toBeGreaterThan(0);

      // A named period is a request for that occurrence whether or not its bell is
      // ringing, so asking for period two at this instant still opens it.
      const asked = await getAttendanceWorkspaceForContext(context, { businessDate: SATURDAY, periodId: periodTwoId });
      expect(asked.slots.map((slot) => slot.periodId)).toEqual([periodTwoId]);
      // A filter does not escape the grade scope: the filtered read carries it.
      expect(asked.slots.every((slot) => slot.gradeId === asked.gradeScopeId)).toBe(true);

      // An opened register is put back into the list if the reading has hidden it,
      // and the reading itself is left alone: opening a card is not a view change.
      // Back inside period one's window, so period two is the one the reading hides.
      vi.setSystemTime(duringPeriodOne);
      const openedOffShift = await getAttendanceWorkspaceForContext(context, {
        businessDate: SATURDAY, onlyActivePeriod: true, openSlotKey: `${classroomId}:${periodTwoId}`,
      });
      expect(openedOffShift.activeOnly).toBe(true);
      expect(openedOffShift.slot?.periodId).toBe(periodTwoId);
      expect(openedOffShift.slots.map((slot) => slot.periodId)).toContain(periodTwoId);
      // The in-session periods are still listed beside it, so the selection is visible
      // rather than open off-list.
      expect(openedOffShift.slots.map((slot) => slot.periodId)).toContain(periodOneId);
    } finally {
      vi.useRealTimers();
    }
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
