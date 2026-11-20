import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { academicYears, classTeachers, classrooms } from "@/lib/db/schema";
import { listEffectiveClassroomStudentsForContext } from "@/features/students/queries";

export function getSchoolBusinessDate(timezone: string, instant = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

export async function listAttendanceClassroomsForContext(context: ActiveSchoolMembership) {
  const db = getDb();
  if (context.role === "SCHOOL_ADMIN") {
    return db.select({ classroom: classrooms, academicYear: academicYears }).from(classrooms)
      .innerJoin(academicYears, and(eq(academicYears.id, classrooms.academicYearId), eq(academicYears.schoolId, context.schoolId)))
      .where(and(eq(classrooms.schoolId, context.schoolId), eq(classrooms.status, "ACTIVE"), eq(academicYears.status, "ACTIVE")))
      .orderBy(asc(classrooms.name));
  }

  return db.select({ classroom: classrooms, academicYear: academicYears }).from(classrooms)
    .innerJoin(academicYears, and(eq(academicYears.id, classrooms.academicYearId), eq(academicYears.schoolId, context.schoolId)))
    .innerJoin(classTeachers, and(
      eq(classTeachers.classroomId, classrooms.id),
      eq(classTeachers.schoolId, context.schoolId),
      eq(classTeachers.teacherMembershipId, context.membershipId),
      eq(classTeachers.status, "ACTIVE"),
    ))
    .where(and(eq(classrooms.schoolId, context.schoolId), eq(classrooms.status, "ACTIVE"), eq(academicYears.status, "ACTIVE")))
    .orderBy(asc(classrooms.name));
}

export async function getAttendanceWorkspaceForContext(context: ActiveSchoolMembership, classroomId?: string) {
  const date = getSchoolBusinessDate(context.school.timezone);
  const classrooms = await listAttendanceClassroomsForContext(context);
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

export async function getAttendanceWorkspace(options: { headers: Headers; classroomId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, roles: ["SCHOOL_ADMIN", "TEACHER"] });
  return getAttendanceWorkspaceForContext(context, options.classroomId);
}
