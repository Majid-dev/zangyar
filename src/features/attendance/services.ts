import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { writeAuditEvent } from "@/lib/audit";
import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { addMinutes, getSchoolBusinessDate, schoolLocalDateTimeToInstant } from "@/lib/date";
import {
  academicYears,
  attendanceRecords,
  attendanceSessions,
  classrooms,
  guardians,
  notificationOutbox,
  schoolOperatingDays,
  schoolPeriods,
  schoolSettings,
  studentGuardians,
  subjects,
  timetableEntries,
} from "@/lib/db/schema";
import { listEffectiveClassroomStudentsForContext } from "@/features/students/queries";
import { resolveApplicableShift, schoolDayOfWeek } from "@/features/scheduling/week";

import { submitAttendanceSchema, type SubmitAttendanceInput } from "./schema";

type AttendanceTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

type AttendanceStatus = SubmitAttendanceInput["records"][number]["status"];

function notificationEnabled(settings: typeof schoolSettings.$inferSelect | undefined, status: AttendanceStatus) {
  if (!settings) return false;
  return status === "PRESENT" ? settings.notifyOnPresent
    : status === "ABSENT" ? settings.notifyOnAbsent
      : status === "LATE" ? settings.notifyOnLate
        : settings.notifyOnExcused;
}

function attendanceMessage(status: AttendanceStatus, studentName: string, subjectName: string, businessDate: string) {
  const label = status === "PRESENT" ? "حاضر" : status === "ABSENT" ? "غایب" : status === "LATE" ? "تأخیر" : "موجه";
  return `وضعیت حضور ${studentName} در ${subjectName}، تاریخ ${businessDate}: ${label}`;
}

/**
 * Why this occurrence's attendance may not be submitted yet, or null when it may.
 *
 * Two rules answer "is this period submittable", and they are combined here
 * because a caller that applied one and forgot the other would be wrong in a way
 * that is hard to see. The first is the school's operating week: a date the school
 * is closed has no occurrence at all. The second is the submission window measured
 * from the period's end, which is what stops a teacher from filling in last
 * month's register.
 *
 * A School Admin is exempt from the deadline because correction is their job
 * (ADR-007), but not from the operating-week rule: a period that never happened
 * has nothing to correct.
 */
function occurrenceBlocker(
  context: ActiveSchoolMembership,
  input: { operatingDays: readonly number[]; submissionDeadlineAt: Date; now: Date },
): string | null {
  if (input.operatingDays.length === 0) {
    return "روزهای فعالیت مدرسه تنظیم نشده است؛ ابتدا تنظیمات شیفت و روزها را کامل کنید.";
  }
  if (context.role === "SCHOOL_ADMIN") return null;
  if (input.now > input.submissionDeadlineAt) {
    return "مهلت ثبت حضور و غیاب این زنگ به پایان رسیده است.";
  }
  return null;
}

async function createAttendanceNotificationIntent(
  tx: AttendanceTransaction,
  context: ActiveSchoolMembership,
  attendanceRecord: typeof attendanceRecords.$inferSelect,
  studentId: string,
  studentName: string,
  subjectName: string,
  businessDate: string,
  settings: typeof schoolSettings.$inferSelect | undefined,
) {
  if (!notificationEnabled(settings, attendanceRecord.status)) return;

  const recipients = await tx.select({ guardian: guardians }).from(studentGuardians)
    .innerJoin(guardians, and(
      eq(guardians.id, studentGuardians.guardianId),
      eq(guardians.schoolId, context.schoolId),
      eq(guardians.status, "ACTIVE"),
    ))
    .where(and(
      eq(studentGuardians.schoolId, context.schoolId),
      eq(studentGuardians.studentId, studentId),
      eq(studentGuardians.receivesSms, true),
      sql`${guardians.normalizedMobile} is not null`,
    ));

  for (const { guardian } of recipients) {
    if (!guardian.normalizedMobile) continue;
    await tx.insert(notificationOutbox).values({
      schoolId: context.schoolId,
      eventType: "ATTENDANCE",
      attendanceRecordId: attendanceRecord.id,
      guardianId: guardian.id,
      recipientMobile: guardian.normalizedMobile,
      message: attendanceMessage(attendanceRecord.status, studentName, subjectName, businessDate),
      policyDecision: true,
      // Keyed by the attendance record rather than by period and student, because
      // the record is already unique per session and enrollment: correcting a
      // status within one period must not queue a second message for the same
      // correction, while the status is part of the key so a real change does.
      idempotencyKey: `attendance:${attendanceRecord.id}:${guardian.id}:${attendanceRecord.status}`,
    }).onConflictDoNothing({ target: [notificationOutbox.schoolId, notificationOutbox.idempotencyKey] });
  }
}

export async function submitAttendanceForContext(
  context: ActiveSchoolMembership,
  rawInput: SubmitAttendanceInput,
  options: { now?: Date } = {},
) {
  const input = submitAttendanceSchema.parse(rawInput);
  const now = options.now ?? new Date();
  const expectedDate = getSchoolBusinessDate(context.school.timezone, now);
  if (context.role === "TEACHER" && input.businessDate > expectedDate) {
    throw new Error("Teachers cannot record attendance for a future date.");
  }

  return getDb().transaction(async (tx) => {
    const [row] = await tx.select({
      entry: timetableEntries,
      period: schoolPeriods,
      classroom: classrooms,
      academicYear: academicYears,
      subject: subjects,
    }).from(timetableEntries)
      .innerJoin(schoolPeriods, and(
        eq(schoolPeriods.id, timetableEntries.periodId),
        eq(schoolPeriods.schoolId, context.schoolId),
      ))
      .innerJoin(classrooms, and(eq(classrooms.id, timetableEntries.classroomId), eq(classrooms.schoolId, context.schoolId)))
      .innerJoin(academicYears, and(eq(academicYears.id, timetableEntries.academicYearId), eq(academicYears.schoolId, context.schoolId)))
      .innerJoin(subjects, and(eq(subjects.id, timetableEntries.subjectId), eq(subjects.schoolId, context.schoolId)))
      .where(and(
        eq(timetableEntries.id, input.timetableEntryId),
        eq(timetableEntries.schoolId, context.schoolId),
        eq(timetableEntries.status, "ACTIVE"),
      ))
      .limit(1);
    if (!row) throw new Error("زنگ انتخاب‌شده برای این مدرسه در دسترس نیست.");
    if (row.classroom.status !== "ACTIVE" || row.academicYear.status === "CLOSED" || row.academicYear.status === "ARCHIVED") {
      throw new Error("کلاس یا سال تحصیلی انتخاب‌شده برای ثبت حضور در دسترس نیست.");
    }
    if (input.businessDate < row.academicYear.startDate || input.businessDate >= row.academicYear.endDate) {
      throw new Error("تاریخ ثبت حضور در بازه سال تحصیلی نیست.");
    }
    const operatingDays = await tx.select({ dayOfWeek: schoolOperatingDays.dayOfWeek }).from(schoolOperatingDays)
      .where(eq(schoolOperatingDays.schoolId, context.schoolId));
    const operatingDayList = operatingDays.map((day) => day.dayOfWeek);

    // The operating week is checked before the period's own weekday: "the school is
    // closed that day" is the fact that explains the refusal, and reporting a
    // weekday mismatch instead would send the admin looking at the timetable for a
    // problem that is really in the school's calendar.
    if (!operatingDayList.includes(schoolDayOfWeek(input.businessDate))) {
      throw new Error("این تاریخ در روزهای فعالیت مدرسه نیست.");
    }

    // The weekday the entry names and the weekday the date actually is must agree,
    // or a Tuesday's register could be written into Thursday's period.
    if (row.entry.dayOfWeek !== schoolDayOfWeek(input.businessDate)) {
      throw new Error("این زنگ در روز انتخاب‌شده برگزار نمی‌شود.");
    }

    const [settings] = await tx.select().from(schoolSettings).where(eq(schoolSettings.schoolId, context.schoolId)).limit(1);
    // The shift the school is actually in on this date, resolved from the
    // configuration and the rotation anchor rather than assumed.
    const applicableShiftValue = resolveApplicableShift(input.businessDate, {
      shiftType: settings?.shiftType ?? "MORNING",
      rotationBaseDate: settings?.rotationBaseDate ?? null,
    });

    // The assignment names one teacher, because it is one hour of one period, so
    // responsibility is read rather than resolved: a period whose two hours belong
    // to two people is two assignments, and each register names its own teacher.
    const teacherMembershipId = row.entry.teacherMembershipId;
    if (context.role === "TEACHER" && teacherMembershipId !== context.membershipId) {
      throw new Error("این زنگ به شما تخصیص نیافته است.");
    }

    const submissionDeadlineAt = addMinutes(
      schoolLocalDateTimeToInstant(input.businessDate, row.period.endTime, context.school.timezone),
      settings?.attendanceSubmissionMinutes ?? 0,
    );
    const blocker = occurrenceBlocker(context, { operatingDays: operatingDayList, submissionDeadlineAt, now });
    if (blocker) throw new Error(blocker);

    const [session] = await tx.insert(attendanceSessions).values({
      schoolId: context.schoolId,
      classroomId: row.classroom.id,
      academicYearId: row.academicYear.id,
      businessDate: input.businessDate,
      timetableEntryId: row.entry.id,
      subjectId: row.subject.id,
      teacherMembershipId,
      applicableShift: applicableShiftValue,
      createdByMembershipId: context.membershipId,
      submissionDeadlineAt,
    }).onConflictDoUpdate({
      // A retry of the same occurrence reuses its session. The deadline is
      // rewritten because it is a function of the same period and policy, so
      // recomputing it changes nothing a teacher could have relied on.
      target: [attendanceSessions.schoolId, attendanceSessions.timetableEntryId, attendanceSessions.businessDate],
      set: { submissionDeadlineAt, updatedAt: new Date() },
    }).returning();
    if (!session) throw new Error("ثبت جلسه حضور و غیاب انجام نشد.");

    const roster = await listEffectiveClassroomStudentsForContext(
      context,
      { classroomId: row.classroom.id, businessDate: input.businessDate },
      tx,
    );
    const rosterByEnrollment = new Map(roster.map((item) => [item.enrollment.id, item]));
    if (input.records.some((record) => !rosterByEnrollment.has(record.enrollmentId))) {
      throw new Error("فهرست حضور شامل دانش‌آموزی خارج از کلاس مؤثر است.");
    }

    const existing = await tx.select().from(attendanceRecords).where(and(
      eq(attendanceRecords.schoolId, context.schoolId),
      eq(attendanceRecords.attendanceSessionId, session.id),
      inArray(attendanceRecords.enrollmentId, input.records.map((record) => record.enrollmentId)),
    ));
    const existingByEnrollment = new Map(existing.map((record) => [record.enrollmentId, record]));
    const saved = [];
    for (const record of input.records) {
      const previous = existingByEnrollment.get(record.enrollmentId);
      const [savedRecord] = await tx.insert(attendanceRecords).values({
        schoolId: context.schoolId,
        attendanceSessionId: session.id,
        enrollmentId: record.enrollmentId,
        classroomId: row.classroom.id,
        status: record.status,
        recordedByMembershipId: context.membershipId,
      }).onConflictDoUpdate({
        target: [attendanceRecords.schoolId, attendanceRecords.attendanceSessionId, attendanceRecords.enrollmentId],
        set: { status: record.status, recordedByMembershipId: context.membershipId, updatedAt: new Date() },
      }).returning();
      saved.push(savedRecord);
      if (previous && previous.status !== record.status) {
        await writeAuditEvent(tx, {
          schoolId: context.schoolId,
          actorUserId: context.userId,
          actorMembershipId: context.membershipId,
          action: "ATTENDANCE_CORRECTED",
          entityType: "ATTENDANCE_RECORD",
          entityId: savedRecord.id,
          metadata: {
            previousStatus: previous.status,
            status: record.status,
            businessDate: input.businessDate,
            timetableEntryId: row.entry.id,
            periodOrdinal: row.period.ordinal,
          },
        });
      }
      const rosterStudent = rosterByEnrollment.get(record.enrollmentId);
      if (!rosterStudent) throw new Error("دانش‌آموز حضور در فهرست مؤثر کلاس نیست.");
      await createAttendanceNotificationIntent(
        tx,
        context,
        savedRecord,
        rosterStudent.student.id,
        `${rosterStudent.student.firstName} ${rosterStudent.student.lastName}`,
        row.subject.name,
        input.businessDate,
        settings,
      );
    }
    return { session, records: saved };
  });
}

export async function submitAttendance(options: { headers: Headers; input: SubmitAttendanceInput }) {
  const context = await requireSchoolAccess({ headers: options.headers, roles: ["SCHOOL_ADMIN", "TEACHER"] });
  return submitAttendanceForContext(context, options.input);
}
