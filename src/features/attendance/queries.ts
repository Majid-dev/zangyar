import "server-only";

import { and, asc, countDistinct, eq, inArray } from "drizzle-orm";

import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { academicYears, attendanceRecords, attendanceSessions, classrooms, enrollments, schoolMemberships, schoolPeriods, students, subjects, timetableEntries, users } from "@/lib/db/schema";
import { listEffectiveClassroomStudentsForContext } from "@/features/students/queries";
import { teacherClassroomAccessCondition } from "@/features/scheduling/policy";
import { getSchoolTimetableSettings } from "@/features/scheduling/queries";
import { academicWeekNumber, resolveApplicableShift, resolveAttendanceRotationTeacher, resolvePeriodTimes, schoolDayOfWeek } from "@/features/scheduling/week";
import { getSchoolBusinessDate } from "@/lib/date";

export { getSchoolBusinessDate } from "@/lib/date";

export async function listAttendanceClassroomsForContext(context: ActiveSchoolMembership) {
  const db = getDb();
  if (context.role === "SCHOOL_ADMIN") {
    return db.select({ classroom: classrooms, academicYear: academicYears }).from(classrooms)
      .innerJoin(academicYears, and(eq(academicYears.id, classrooms.academicYearId), eq(academicYears.schoolId, context.schoolId)))
      .where(and(eq(classrooms.schoolId, context.schoolId), eq(classrooms.status, "ACTIVE"), eq(academicYears.status, "ACTIVE")))
      .orderBy(asc(classrooms.name));
  }

  return db.selectDistinct({ classroom: classrooms, academicYear: academicYears }).from(classrooms)
    .innerJoin(academicYears, and(eq(academicYears.id, classrooms.academicYearId), eq(academicYears.schoolId, context.schoolId)))
    .where(and(
      eq(classrooms.schoolId, context.schoolId),
      eq(classrooms.status, "ACTIVE"),
      eq(academicYears.status, "ACTIVE"),
      teacherClassroomAccessCondition(context),
    ))
    .orderBy(asc(classrooms.name));
}

/**
 * The periods a teacher or class still owes attendance for on a date.
 *
 * Attendance is submitted per period, so the useful question is "which of today's
 * periods are unsubmitted". A period whose two hours are two different teachers and
 * two different subjects is *one* row here, not two: the week hands the whole
 * period to one of them, and that is the register the school takes. A period one
 * teacher holds outright is one row whose teacher is that teacher.
 *
 * Who the week names is resolved here rather than stored, so the answer is always
 * a function of the date being looked at — past, present, or future — and cannot
 * drift from the timetable. For a teacher the row is included only when the week
 * names them, which is what makes the other teacher's day not contain it.
 */
export type AttendanceSlot = {
  classroomId: string;
  classroomName: string;
  /** The lesson(s) the period holds, in hour order — one name, or two when split. */
  subjectNames: string[];
  shiftName: string;
  periodId: string;
  periodLabel: string;
  periodOrdinal: number;
  startTime: string;
  endTime: string;
  /** The teacher the week names, or the period's only teacher. */
  teacherMembershipId: string;
  teacherName: string;
  /** The period's other teacher when it alternates, else null. */
  partnerTeacherMembershipId: string | null;
  partnerTeacherName: string | null;
  /** True when the period alternates weekly between two teachers. */
  rotates: boolean;
  /** 1-based week of the academic year this date falls in. */
  academicWeekNumber: number;
  sessionId: string | null;
  sessionStatus: "OPEN" | "CLOSED" | null;
  submissionDeadlineAt: Date | null;
};

export async function listAttendanceSlotsForContext(
  context: ActiveSchoolMembership,
  businessDate: string,
  classroomId?: string,
): Promise<AttendanceSlot[]> {
  const dayOfWeek = schoolDayOfWeek(businessDate);
  const rows = await getDb().select({
    entry: timetableEntries,
    classroom: classrooms,
    subject: subjects,
    year: academicYears,
    session: attendanceSessions,
  }).from(timetableEntries)
    .innerJoin(classrooms, and(eq(classrooms.id, timetableEntries.classroomId), eq(classrooms.schoolId, context.schoolId), eq(classrooms.status, "ACTIVE")))
    .innerJoin(subjects, and(eq(subjects.id, timetableEntries.subjectId), eq(subjects.schoolId, context.schoolId)))
    .innerJoin(academicYears, and(eq(academicYears.id, timetableEntries.academicYearId), eq(academicYears.schoolId, context.schoolId)))
    // The session is looked up by period, not by hour: a split period is one
    // register, so both of its hours join the same session and the two rows are
    // collapsed below.
    .leftJoin(attendanceSessions, and(
      eq(attendanceSessions.periodId, timetableEntries.periodId),
      eq(attendanceSessions.classroomId, timetableEntries.classroomId),
      eq(attendanceSessions.schoolId, context.schoolId),
      eq(attendanceSessions.businessDate, businessDate),
    ))
    .where(and(
      eq(timetableEntries.schoolId, context.schoolId),
      eq(timetableEntries.status, "ACTIVE"),
      eq(timetableEntries.dayOfWeek, dayOfWeek),
      classroomId ? eq(timetableEntries.classroomId, classroomId) : undefined,
    ));
  const periods = await getDb().select().from(schoolPeriods).where(eq(schoolPeriods.schoolId, context.schoolId));
  const periodById = new Map(periods.map((period) => [period.id, period]));
  const settings = await getSchoolTimetableSettings(context);

  // Group the day's hours into the periods they belong to, so a split period
  // becomes one slot. Keyed by classroom and period because two classes can share a
  // period ordinal.
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.entry.classroomId}:${row.entry.periodId}`;
    const existing = grouped.get(key);
    if (existing) existing.push(row);
    else grouped.set(key, [row]);
  }

  const slots: AttendanceSlot[] = [];
  for (const group of grouped.values()) {
    group.sort((left, right) => left.entry.hourIndex - right.entry.hourIndex);
    const first = group[0];
    const period = periodById.get(first.entry.periodId);
    if (!period) continue;

    // A period rotates only when its hours name two different teachers. Two hours
    // that share one teacher are that teacher's period, and the school's rule for a
    // single-teacher period is that they own it every week.
    const teacherIds = [...new Set(group.map((row) => row.entry.teacherMembershipId))];
    const rotates = teacherIds.length === 2;
    const baseTeacherId = teacherIds[0];
    const partnerTeacherId = rotates ? teacherIds[1] : null;
    const rotationTeacherId = resolveAttendanceRotationTeacher(
      rotates && partnerTeacherId ? { baseTeacherMembershipId: baseTeacherId, partnerTeacherMembershipId: partnerTeacherId } : null,
      first.year.startDate,
      businessDate,
    );
    const teacherMembershipId = rotationTeacherId ?? baseTeacherId;

    // The other teacher sees their class but not this period in their own list: it
    // is not theirs to submit this week.
    if (context.role === "TEACHER" && teacherMembershipId !== context.membershipId) continue;

    const nameByMembership = await resolveTeacherNames(context, [teacherMembershipId, partnerTeacherId].filter((id): id is string => Boolean(id)));
    // The times the period actually runs at on this date, from the shift the school
    // is in — so a rotating school's afternoon row shows the afternoon schedule
    // rather than the morning one.
    const applicableShift = resolveApplicableShift(businessDate, {
      shiftType: settings.shiftType,
      rotationBaseDate: settings.rotationBaseDate,
    });
    const periodTimes = resolvePeriodTimes(period, applicableShift);
    slots.push({
      classroomId: first.classroom.id,
      classroomName: first.classroom.name,
      subjectNames: group.map((row) => row.subject.name),
      shiftName: applicableShift === "MORNING" ? "صبح" : "بعدازظهر",
      periodId: period.id,
      periodLabel: String(period.ordinal),
      periodOrdinal: period.ordinal,
      startTime: periodTimes.startTime,
      endTime: periodTimes.endTime,
      teacherMembershipId,
      teacherName: nameByMembership.get(teacherMembershipId) ?? "",
      partnerTeacherMembershipId: partnerTeacherId,
      partnerTeacherName: partnerTeacherId ? nameByMembership.get(partnerTeacherId) ?? null : null,
      rotates,
      academicWeekNumber: academicWeekNumber(first.year.startDate, businessDate),
      sessionId: first.session?.id ?? null,
      sessionStatus: first.session?.status ?? null,
      submissionDeadlineAt: first.session?.submissionDeadlineAt ?? null,
    });
  }
  return slots.sort((left, right) =>
    left.startTime.localeCompare(right.startTime)
    || left.classroomName.localeCompare(right.classroomName));
}

/** Teacher display names for the memberships a slot names. */
async function resolveTeacherNames(context: ActiveSchoolMembership, membershipIds: readonly string[]) {
  if (membershipIds.length === 0) return new Map<string, string>();
  const rows = await getDb().select({ id: schoolMemberships.id, name: users.name }).from(schoolMemberships)
    .innerJoin(users, eq(users.id, schoolMemberships.userId))
    .where(and(eq(schoolMemberships.schoolId, context.schoolId), inArray(schoolMemberships.id, [...membershipIds])));
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function getAttendanceWorkspaceForContext(
  context: ActiveSchoolMembership,
  options: { businessDate?: string; periodId?: string; classroomId?: string } = {},
) {
  const businessDate = options.businessDate ?? getSchoolBusinessDate(context.school.timezone);
  const slots = await listAttendanceSlotsForContext(context, businessDate);
  // A period id is only unique within a classroom, so classroom and period are read
  // together — the same pair the grid rows are keyed on.
  const selected = slots.find((slot) => slot.periodId === options.periodId && (!options.classroomId || slot.classroomId === options.classroomId)) ?? slots[0];
  if (!selected) return { businessDate, slots, slot: null, students: [] as { id: string; enrollmentId: string; name: string; code: string }[] };
  const roster = await listEffectiveClassroomStudentsForContext(context, { classroomId: selected.classroomId, businessDate });
  return {
    businessDate,
    slots,
    slot: selected,
    students: roster.map(({ student, enrollment }) => ({
      id: student.id,
      enrollmentId: enrollment.id,
      name: `${student.firstName} ${student.lastName}`,
      code: student.admissionNumber,
    })),
  };
}

export type AttendanceSummary = {
  date: string;
  classroomCount: number;
  studentCount: number;
  counts: Record<"PRESENT" | "ABSENT" | "LATE" | "EXCUSED", number>;
  /** Periods scheduled today that have no session yet. */
  pendingPeriodCount: number;
  periodCount: number;
};

export async function getAttendanceSummaryForContext(context: ActiveSchoolMembership): Promise<AttendanceSummary> {
  const date = getSchoolBusinessDate(context.school.timezone);
  const [slots, classroomRows] = await Promise.all([
    listAttendanceSlotsForContext(context, date),
    listAttendanceClassroomsForContext(context),
  ]);
  const classroomIds = classroomRows.map(({ classroom }) => classroom.id);
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 } as AttendanceSummary["counts"];
  const pendingPeriodCount = slots.filter((slot) => slot.sessionId === null).length;
  if (classroomIds.length === 0) {
    return { date, classroomCount: 0, studentCount: 0, counts, pendingPeriodCount: 0, periodCount: 0 };
  }

  const rows = await getDb().select({ status: attendanceRecords.status, count: countDistinct(attendanceRecords.id) })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, and(eq(attendanceSessions.id, attendanceRecords.attendanceSessionId), eq(attendanceSessions.schoolId, context.schoolId), eq(attendanceSessions.businessDate, date)))
    .where(and(eq(attendanceRecords.schoolId, context.schoolId), inArray(attendanceRecords.classroomId, classroomIds)))
    .groupBy(attendanceRecords.status);
  for (const row of rows) counts[row.status] = Number(row.count);

  // Distinct students who had at least one status recorded today, rather than a
  // sum over periods: a student appears in several periods and must be counted
  // once.
  const [studentTotal] = await getDb().select({ count: countDistinct(enrollments.studentId) })
    .from(enrollments)
    .innerJoin(students, and(eq(students.id, enrollments.studentId), eq(students.schoolId, context.schoolId), eq(students.status, "ACTIVE")))
    .innerJoin(attendanceRecords, and(eq(attendanceRecords.enrollmentId, enrollments.id), eq(attendanceRecords.schoolId, context.schoolId), inArray(attendanceRecords.classroomId, classroomIds)))
    .innerJoin(attendanceSessions, and(eq(attendanceSessions.id, attendanceRecords.attendanceSessionId), eq(attendanceSessions.schoolId, context.schoolId), eq(attendanceSessions.businessDate, date)))
    .where(eq(enrollments.schoolId, context.schoolId));

  return {
    date,
    classroomCount: classroomIds.length,
    studentCount: Number(studentTotal?.count ?? 0),
    counts,
    pendingPeriodCount,
    periodCount: slots.length,
  };
}

export async function getAttendanceWorkspace(options: { headers: Headers; businessDate?: string; periodId?: string; classroomId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, roles: ["SCHOOL_ADMIN", "TEACHER"] });
  return getAttendanceWorkspaceForContext(context, { businessDate: options.businessDate, periodId: options.periodId, classroomId: options.classroomId });
}
