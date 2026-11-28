import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

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
import { resolveApplicableShift, resolveAttendanceRotationTeacher, resolvePeriodTimes, schoolDayOfWeek } from "@/features/scheduling/week";

import { submitAttendanceSchema, type SubmitAttendanceInput } from "./schema";
import { resolveAttendanceWindow } from "./window";

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
 * Why this occurrence's attendance may not be written now, or null when it may.
 *
 * Two rules answer "is this period submittable", and they are combined here
 * because a caller that applied one and forgot the other would be wrong in a way
 * that is hard to see. The first is the school's operating week: a date the school
 * is closed has no occurrence at all. The second is the occurrence's window —
 * between the bell and the lapse of the grace period, with a School Admin exempt
 * from the deadline because correction is their job (ADR-007).
 *
 * The window itself is `resolveAttendanceWindow`, the same call the attendance
 * page renders its badges from, so a slot the interface draws as submittable is
 * exactly one this function allows, and the two cannot drift apart by being two
 * restatements of one rule.
 */
function occurrenceBlocker(
  context: ActiveSchoolMembership,
  input: {
    operatingDays: readonly number[];
    periodStartAt: Date;
    periodEndAt: Date;
    submissionDeadlineAt: Date;
    hasSession: boolean;
    sessionClosed: boolean;
    now: Date;
  },
): string | null {
  if (input.operatingDays.length === 0) {
    return "روزهای فعالیت مدرسه تنظیم نشده است؛ ابتدا تنظیمات شیفت و روزها را کامل کنید.";
  }
  return resolveAttendanceWindow({
    now: input.now,
    periodStartAt: input.periodStartAt,
    periodEndAt: input.periodEndAt,
    submissionDeadlineAt: input.submissionDeadlineAt,
    hasSession: input.hasSession,
    sessionClosed: input.sessionClosed,
    role: context.role,
  }).blocker;
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
    // The period's hours are read together, because the register is for the period
    // and the responsible teacher is a property of the two of them: one teacher
    // owns the whole period whichever week it is theirs, and a split period hands
    // between its two teachers. Reading only one hour could not tell a split period
    // from a single-teacher one.
    //
    // The rows are read without filtering on the submitted date's weekday, so the
    // refusals below can be ordered the way they read: whether the period exists at
    // all, then whether the school is open that day, then whether the period is
    // scheduled on it. Filtering by weekday here would collapse the first and third
    // into one "not found", which is the least useful of the three answers. The
    // weekday is applied in memory immediately afterwards, once the "does it exist"
    // question has been answered and before anything else is decided from the rows.
    const rows = await tx.select({
      entry: timetableEntries,
      period: schoolPeriods,
      classroom: classrooms,
      academicYear: academicYears,
    }).from(timetableEntries)
      .innerJoin(schoolPeriods, and(
        eq(schoolPeriods.id, timetableEntries.periodId),
        eq(schoolPeriods.schoolId, context.schoolId),
      ))
      .innerJoin(classrooms, and(eq(classrooms.id, timetableEntries.classroomId), eq(classrooms.schoolId, context.schoolId)))
      .innerJoin(academicYears, and(eq(academicYears.id, timetableEntries.academicYearId), eq(academicYears.schoolId, context.schoolId)))
      .where(and(
        eq(timetableEntries.classroomId, input.classroomId),
        eq(timetableEntries.periodId, input.periodId),
        eq(timetableEntries.schoolId, context.schoolId),
        eq(timetableEntries.status, "ACTIVE"),
      ))
      .orderBy(asc(timetableEntries.hourIndex));
    // Any row answers "does this period exist here at all": they all name the same
    // period, classroom, and year, which are the three facts read off them below.
    const [anyRow] = rows;
    if (!anyRow) throw new Error("زنگ انتخاب‌شده برای این مدرسه در دسترس نیست.");

    const row = { classroom: anyRow.classroom, academicYear: anyRow.academicYear, period: anyRow.period };
    if (row.classroom.status !== "ACTIVE" || row.academicYear.status === "CLOSED" || row.academicYear.status === "ARCHIVED") {
      throw new Error("کلاس یا سال تحصیلی انتخاب‌شده برای ثبت حضور در دسترس نیست.");
    }
    if (input.businessDate < row.academicYear.startDate || input.businessDate >= row.academicYear.endDate) {
      throw new Error("تاریخ ثبت حضور در بازه سال تحصیلی نیست.");
    }
    const operatingDays = await tx.select({ dayOfWeek: schoolOperatingDays.dayOfWeek }).from(schoolOperatingDays)
      .where(eq(schoolOperatingDays.schoolId, context.schoolId));
    const operatingDayList = operatingDays.map((day) => day.dayOfWeek);
    const submittedDayOfWeek = schoolDayOfWeek(input.businessDate);

    // The hours of the period *on the day being registered*. A period can be
    // scheduled on more than one weekday — a class that meets twice a week holds two
    // sets of rows for the same period id — so the rows read above, which are ordered
    // by hour alone, mix the weekdays together and their first row can belong to
    // another day. Narrowing to the submitted weekday before anything is decided from
    // them is what keeps "does this period meet today" a real question and stops the
    // weekday check below from comparing the date against a row for a different day.
    const dayRows = rows.filter((entryRow) => entryRow.entry.dayOfWeek === submittedDayOfWeek);

    // The operating week is checked before the period's own weekday: "the school is
    // closed that day" is the fact that explains the refusal, and reporting a
    // weekday mismatch instead would send the admin looking at the timetable for a
    // problem that is really in the school's calendar.
    if (!operatingDayList.includes(submittedDayOfWeek)) {
      throw new Error("این تاریخ در روزهای فعالیت مدرسه نیست.");
    }

    // The period must actually meet on the date's weekday, or a Tuesday's register
    // could be written into a Thursday's period.
    if (dayRows.length === 0) {
      throw new Error("این زنگ در روز انتخاب‌شده برگزار نمی‌شود.");
    }

    const [settings] = await tx.select().from(schoolSettings).where(eq(schoolSettings.schoolId, context.schoolId)).limit(1);
    // The shift the school is actually in on this date, resolved from the
    // configuration and the rotation anchor rather than assumed.
    const applicableShiftValue = resolveApplicableShift(input.businessDate, {
      shiftType: settings?.shiftType ?? "MORNING",
      rotationBaseDate: settings?.rotationBaseDate ?? null,
    });

    // Who owes this period this week, judged from the day's own hours rather than
    // from the whole week's: a period split on Saturday need not be split on
    // Wednesday, so the pair that alternates is a property of the day.
    const teacherIds = [...new Set(dayRows.map((entryRow) => entryRow.entry.teacherMembershipId))];
    const rotates = teacherIds.length === 2;
    const responsibleTeacherId = resolveAttendanceRotationTeacher(
      rotates ? { baseTeacherMembershipId: teacherIds[0], partnerTeacherMembershipId: teacherIds[1] } : null,
      row.academicYear.startDate,
      input.businessDate,
    ) ?? teacherIds[0];
    // A teacher may submit only the week the rotation names them for. The other
    // teacher in a split period is refused while it is not their week, which is
    // what makes the alternation a rule rather than a convention.
    if (context.role === "TEACHER" && responsibleTeacherId !== context.membershipId) {
      throw new Error(rotates
        ? "این زنگ در این هفته به شما تخصیص نیافته است؛ ثبت حضور آن با دبیر مسئول همین هفته است."
        : "این زنگ به شما تخصیص نیافته است.");
    }
    const teacherMembershipId = responsibleTeacherId;

    // The deadline is measured from the end of the period *in the shift this date
    // falls in*: a rotating school's afternoon period can end at a different time
    // from its morning one, and a late register must not be judged against the other
    // shift's clock. The grace period is applied after that actual end time.
    const periodTimes = resolvePeriodTimes(row.period, applicableShiftValue);
    const periodStartAt = schoolLocalDateTimeToInstant(input.businessDate, periodTimes.startTime, context.school.timezone);
    const periodEndAt = schoolLocalDateTimeToInstant(input.businessDate, periodTimes.endTime, context.school.timezone);
    const submissionDeadlineAt = addMinutes(periodEndAt, settings?.attendanceSubmissionMinutes ?? 0);
    // Whether this occurrence already has a register is read before the window is
    // judged, because it is what distinguishes inventing a register from correcting
    // one — and a correction is refused with a sentence about editing, not about a
    // first submission.
    const [existingSession] = await tx.select({ id: attendanceSessions.id, status: attendanceSessions.status }).from(attendanceSessions).where(and(
      eq(attendanceSessions.schoolId, context.schoolId),
      eq(attendanceSessions.classroomId, row.classroom.id),
      eq(attendanceSessions.periodId, row.period.id),
      eq(attendanceSessions.businessDate, input.businessDate),
    )).limit(1);
    const blocker = occurrenceBlocker(context, {
      operatingDays: operatingDayList,
      periodStartAt,
      periodEndAt,
      submissionDeadlineAt,
      hasSession: Boolean(existingSession),
      sessionClosed: existingSession?.status === "CLOSED",
      now,
    });
    if (blocker) throw new Error(blocker);

    // The period's lessons, for the notification text. A split period has two, which
    // is why this is a list rather than a single name — and they are the day's own
    // lessons, since the same period can hold different subjects on another weekday.
    const subjectRows = await tx.select({ name: subjects.name }).from(subjects).where(and(
      eq(subjects.schoolId, context.schoolId),
      inArray(subjects.id, [...new Set(dayRows.map((entryRow) => entryRow.entry.subjectId))]),
    ));
    const subjectNames = subjectRows.map((subjectRow) => subjectRow.name);

    const [session] = await tx.insert(attendanceSessions).values({
      schoolId: context.schoolId,
      classroomId: row.classroom.id,
      academicYearId: row.academicYear.id,
      businessDate: input.businessDate,
      periodId: row.period.id,
      teacherMembershipId,
      applicableShift: applicableShiftValue,
      createdByMembershipId: context.membershipId,
      submissionDeadlineAt,
    }).onConflictDoUpdate({
      // A retry of the same occurrence reuses its session. The responsible teacher
      // follows the week rather than the row, so it is rewritten too — a submission
      // in a later week is that week's teacher's, not the first one's.
      target: [attendanceSessions.schoolId, attendanceSessions.classroomId, attendanceSessions.periodId, attendanceSessions.businessDate],
      set: { teacherMembershipId, submissionDeadlineAt, updatedAt: new Date() },
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
    // Shaped as the client's own view of a saved row rather than the raw columns:
    // the interface needs the admin-edit pair and nothing else it does not already
    // have, and naming the fields here keeps that contract explicit instead of
    // letting whatever the table grows next leak to the browser.
    const saved: SubmitAttendanceResult["records"] = [];
    for (const record of input.records) {
      const previous = existingByEnrollment.get(record.enrollmentId);
      // A School Admin changing a status that is already on record is the edit the
      // interface has to disclose; the same admin taking a register nobody has taken
      // is a first submission, not an edit, and is not tagged as one.
      const isAdminEdit = context.role === "SCHOOL_ADMIN"
        && previous !== undefined
        && previous.status !== record.status;
      // Stamped once and never rewritten, so the tag answers "has the office ever
      // changed this" and keeps an answer that stays true through any number of
      // later edits — by the same admin or by the teacher. The ordered history of
      // every change is the audit log's job, not this record's.
      const stampAdminEdit = isAdminEdit && previous.adminEditedAt === null;

      const [savedRecord] = await tx.insert(attendanceRecords).values({
        schoolId: context.schoolId,
        attendanceSessionId: session.id,
        enrollmentId: record.enrollmentId,
        classroomId: row.classroom.id,
        status: record.status,
        recordedByMembershipId: context.membershipId,
        // A row that did not exist until now was not edited by anyone, so it starts
        // untagged; the tag is only ever set on a conflicting update below.
        adminEditedAt: null,
        adminEditedByMembershipId: null,
      }).onConflictDoUpdate({
        target: [attendanceRecords.schoolId, attendanceRecords.attendanceSessionId, attendanceRecords.enrollmentId],
        // `recordedByMembershipId` is deliberately absent from the update: it names
        // whoever took the register, and a correction — especially an admin's — must
        // not erase the fact that the teacher submitted it. `adminEditedAt` is only
        // in the update when this is the *first* admin edit, so the pair keeps the
        // original administrator and timestamp rather than the most recent one.
        set: {
          status: record.status,
          updatedAt: new Date(),
          ...(stampAdminEdit ? { adminEditedAt: new Date(), adminEditedByMembershipId: context.membershipId } : {}),
        },
      }).returning();
      saved.push({
        enrollmentId: savedRecord.enrollmentId,
        status: savedRecord.status,
        adminEditedAt: savedRecord.adminEditedAt?.toISOString() ?? null,
      });
      if (previous && previous.status !== record.status) {
        await writeAuditEvent(tx, {
          schoolId: context.schoolId,
          actorUserId: context.userId,
          actorMembershipId: context.membershipId,
          action: isAdminEdit ? "ATTENDANCE_CORRECTED_BY_ADMIN" : "ATTENDANCE_CORRECTED",
          entityType: "ATTENDANCE_RECORD",
          entityId: savedRecord.id,
          metadata: {
            previousStatus: previous.status,
            status: record.status,
            businessDate: input.businessDate,
            periodId: row.period.id,
            periodOrdinal: row.period.ordinal,
            // The teacher the register belonged to, so the trail still says whose
            // submission was overridden after `recordedByMembershipId` stops being
            // the last writer.
            recordedByMembershipId: previous.recordedByMembershipId,
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
        // The register is for the period, and a split period holds two subjects, so
        // the message names them together rather than picking one of the two.
        subjectNames.join(" / "),
        input.businessDate,
        settings,
      );
    }
    return { records: saved, sessionId: session.id, recordedCount: saved.length };
  });
}

/**
 * What the client learns about a save, and nothing more.
 *
 * The register is updated from this rather than from a reload, so the interface can
 * fold the server's answer — the statuses it actually stored, and whether this save
 * was the administrator edit that should raise the disclosure tag — into the rows it
 * is already showing. Returning the whole session row would carry columns the page
 * never reads across the boundary for no reason.
 */
export type SubmitAttendanceResult = {
  records: { enrollmentId: string; status: AttendanceStatus; adminEditedAt: string | null }[];
  sessionId: string;
  recordedCount: number;
};

export async function submitAttendance(options: { headers: Headers; input: SubmitAttendanceInput }) {
  const context = await requireSchoolAccess({ headers: options.headers, roles: ["SCHOOL_ADMIN", "TEACHER"] });
  return submitAttendanceForContext(context, options.input);
}
