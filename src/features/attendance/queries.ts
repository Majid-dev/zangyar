import "server-only";

import { and, asc, countDistinct, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";

import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { academicYears, attendanceRecords, attendanceSessions, classTeachers, classrooms, enrollments, students } from "@/lib/db/schema";
import { listEffectiveClassroomStudentsForContext } from "@/features/students/queries";
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

  const businessDate = getSchoolBusinessDate(context.school.timezone);
  return db.selectDistinct({ classroom: classrooms, academicYear: academicYears }).from(classrooms)
    .innerJoin(academicYears, and(eq(academicYears.id, classrooms.academicYearId), eq(academicYears.schoolId, context.schoolId)))
    .innerJoin(classTeachers, and(
      eq(classTeachers.classroomId, classrooms.id),
      eq(classTeachers.schoolId, context.schoolId),
      eq(classTeachers.teacherMembershipId, context.membershipId),
      eq(classTeachers.status, "ACTIVE"),
      lte(classTeachers.startDate, businessDate),
      or(isNull(classTeachers.endDate), gt(classTeachers.endDate, businessDate)),
    ))
    .where(and(eq(classrooms.schoolId, context.schoolId), eq(classrooms.status, "ACTIVE"), eq(academicYears.status, "ACTIVE")))
    .orderBy(asc(classrooms.name));
}

export async function getAttendanceWorkspaceForContext(context: ActiveSchoolMembership, classroomId?: string) {
  const date = getSchoolBusinessDate(context.school.timezone);
  const classrooms = await listAttendanceClassroomsForContext(context);
  if (classroomId && !classrooms.some(({ classroom }) => classroom.id === classroomId)) {
    throw new Error("Selected classroom is not available for this account.");
  }
  const selected = classrooms.find(({ classroom }) => classroom.id === classroomId) ?? classrooms[0];
  if (!selected) return { date, classroom: null, students: [] as { id: string; enrollmentId: string; name: string; code: string }[] };
  const roster = await listEffectiveClassroomStudentsForContext(context, { classroomId: selected.classroom.id, businessDate: date });
  return {
    date,
    classroom: selected,
    students: roster.map((row) => ({
      student: row.student,
      enrollment: row.enrollment,
    })).map(({ student, enrollment }) => ({
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
  pendingClassroomCount: number;
};

export async function getAttendanceSummaryForContext(context: ActiveSchoolMembership): Promise<AttendanceSummary> {
  const date = getSchoolBusinessDate(context.school.timezone);
  const classroomRows = await listAttendanceClassroomsForContext(context);
  const classroomIds = classroomRows.map(({ classroom }) => classroom.id);
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 } as AttendanceSummary["counts"];
  if (classroomIds.length === 0) return { date, classroomCount: 0, studentCount: 0, counts, pendingClassroomCount: 0 };

  const rows = await getDb().select({ status: attendanceRecords.status, count: countDistinct(attendanceRecords.id) })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, and(eq(attendanceSessions.id, attendanceRecords.attendanceSessionId), eq(attendanceSessions.schoolId, context.schoolId), eq(attendanceSessions.businessDate, date)))
    .where(and(eq(attendanceRecords.schoolId, context.schoolId), inArray(attendanceRecords.classroomId, classroomIds)))
    .groupBy(attendanceRecords.status);
  for (const row of rows) counts[row.status] = Number(row.count);

  const [studentTotal] = await getDb().select({ count: countDistinct(enrollments.id) })
    .from(enrollments)
    .innerJoin(students, and(eq(students.id, enrollments.studentId), eq(students.schoolId, context.schoolId), eq(students.status, "ACTIVE")))
    .innerJoin(attendanceRecords, and(eq(attendanceRecords.enrollmentId, enrollments.id), eq(attendanceRecords.schoolId, context.schoolId), inArray(attendanceRecords.classroomId, classroomIds)))
    .innerJoin(attendanceSessions, and(eq(attendanceSessions.id, attendanceRecords.attendanceSessionId), eq(attendanceSessions.schoolId, context.schoolId), eq(attendanceSessions.businessDate, date)))
    .where(eq(enrollments.schoolId, context.schoolId));
  const [completed] = await getDb().select({ count: countDistinct(attendanceSessions.classroomId) }).from(attendanceSessions).where(and(eq(attendanceSessions.schoolId, context.schoolId), eq(attendanceSessions.businessDate, date), inArray(attendanceSessions.classroomId, classroomIds)));

  return { date, classroomCount: classroomIds.length, studentCount: Number(studentTotal?.count ?? 0), counts, pendingClassroomCount: classroomIds.length - Number(completed?.count ?? 0) };
}

export async function getAttendanceWorkspace(options: { headers: Headers; classroomId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, roles: ["SCHOOL_ADMIN", "TEACHER"] });
  return getAttendanceWorkspaceForContext(context, options.classroomId);
}
