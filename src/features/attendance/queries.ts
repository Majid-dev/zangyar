import "server-only";

import { and, asc, countDistinct, eq, inArray } from "drizzle-orm";

import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { academicYears, attendanceRecords, attendanceSessions, classrooms, enrollments, schoolPeriods, students, subjects, timetableEntries } from "@/lib/db/schema";
import { listEffectiveClassroomStudentsForContext } from "@/features/students/queries";
import { teacherClassroomAccessCondition } from "@/features/scheduling/policy";
import { getSchoolTimetableSettings } from "@/features/scheduling/queries";
import { schoolDayOfWeek } from "@/features/scheduling/week";
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
 * The teaching hours a teacher or class still owes attendance for on a date.
 *
 * This is the page's real subject now: attendance is submitted per teaching hour,
 * so the useful question is not "which classes exist" but "which of today's hours
 * are unsubmitted". Every hour of an operating day that the timetable fills becomes
 * one row here, whether or not a session has been opened for it — so a period whose
 * two hours are two different lessons shows as two rows, each naming its own
 * subject and teacher, and a full lesson shows as two rows that happen to agree.
 */
export type AttendanceSlot = {
  timetableEntryId: string;
  classroomId: string;
  classroomName: string;
  subjectName: string;
  teacherMembershipId: string;
  shiftName: string;
  periodId: string;
  periodLabel: string;
  periodOrdinal: number;
  hourIndex: number;
  startTime: string;
  endTime: string;
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
    session: attendanceSessions,
  }).from(timetableEntries)
    .innerJoin(classrooms, and(eq(classrooms.id, timetableEntries.classroomId), eq(classrooms.schoolId, context.schoolId), eq(classrooms.status, "ACTIVE")))
    .innerJoin(subjects, and(eq(subjects.id, timetableEntries.subjectId), eq(subjects.schoolId, context.schoolId)))
    .leftJoin(attendanceSessions, and(
      eq(attendanceSessions.timetableEntryId, timetableEntries.id),
      eq(attendanceSessions.schoolId, context.schoolId),
      eq(attendanceSessions.businessDate, businessDate),
    ))
    .where(and(
      eq(timetableEntries.schoolId, context.schoolId),
      eq(timetableEntries.status, "ACTIVE"),
      eq(timetableEntries.dayOfWeek, dayOfWeek),
      classroomId ? eq(timetableEntries.classroomId, classroomId) : undefined,
      // A teacher's own hours, which is the whole of their day: the assignment
      // names them directly, so there is no rotation left to resolve away.
      context.role === "TEACHER" ? eq(timetableEntries.teacherMembershipId, context.membershipId) : undefined,
    ));
  const periods = await getDb().select().from(schoolPeriods).where(eq(schoolPeriods.schoolId, context.schoolId));
  const periodById = new Map(periods.map((period) => [period.id, period]));
  const settings = await getSchoolTimetableSettings(context);

  const slots: AttendanceSlot[] = [];
  for (const row of rows) {
    const period = periodById.get(row.entry.periodId);
    if (!period) continue;
    slots.push({
      timetableEntryId: row.entry.id,
      classroomId: row.classroom.id,
      classroomName: row.classroom.name,
      subjectName: row.subject.name,
      teacherMembershipId: row.entry.teacherMembershipId,
      shiftName: settings.shiftType === "ROTATING" ? "چرخشی هفتگی" : settings.shiftType === "MORNING" ? "صبح" : "بعدازظهر",
      periodId: period.id,
      periodLabel: String(period.ordinal),
      periodOrdinal: period.ordinal,
      hourIndex: row.entry.hourIndex,
      startTime: period.startTime,
      endTime: period.endTime,
      sessionId: row.session?.id ?? null,
      sessionStatus: row.session?.status ?? null,
      submissionDeadlineAt: row.session?.submissionDeadlineAt ?? null,
    });
  }
  return slots.sort((left, right) =>
    left.startTime.localeCompare(right.startTime)
    || left.hourIndex - right.hourIndex
    || left.classroomName.localeCompare(right.classroomName));
}

export async function getAttendanceWorkspaceForContext(
  context: ActiveSchoolMembership,
  options: { businessDate?: string; timetableEntryId?: string } = {},
) {
  const businessDate = options.businessDate ?? getSchoolBusinessDate(context.school.timezone);
  const slots = await listAttendanceSlotsForContext(context, businessDate);
  const selected = slots.find((slot) => slot.timetableEntryId === options.timetableEntryId) ?? slots[0];
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

export async function getAttendanceWorkspace(options: { headers: Headers; businessDate?: string; timetableEntryId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, roles: ["SCHOOL_ADMIN", "TEACHER"] });
  return getAttendanceWorkspaceForContext(context, { businessDate: options.businessDate, timetableEntryId: options.timetableEntryId });
}
