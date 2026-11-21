import "server-only";

import { and, asc, count, desc, eq, gt, ilike, isNull, lte, or, sql } from "drizzle-orm";

import { requireStudentManagementAccess, requireStudentReadAccess } from "./policy";
import { maskMobile } from "./normalization";
import { studentListFilterSchema, rosterSchema, type StudentListFilter } from "./schema";
import { getDb } from "@/lib/db";
import { academicYears, classTeachers, classrooms, enrollments, guardians, studentGuardians, students } from "@/lib/db/schema";
import type { ActiveSchoolMembership } from "@/lib/auth/authorization";

export type StudentListRow = {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  status: typeof students.$inferSelect.status;
  classroomName: string | null;
  academicYearName: string | null;
  guardianName: string | null;
  guardianMobile: string | null;
};

export async function listStudents(options: { headers: Headers; filters?: Partial<StudentListFilter> }) {
  const context = await requireStudentReadAccess(options.headers);
  return listStudentsForContext(context, studentListFilterSchema.parse(options.filters ?? {}));
}

export async function listStudentsForContext(context: ActiveSchoolMembership, filters: StudentListFilter) {
  const db = getDb();
  const search = filters.search ? `%${filters.search}%` : undefined;
  const studentConditions = and(
    eq(students.schoolId, context.schoolId),
    filters.status ? eq(students.status, filters.status) : undefined,
    search ? or(ilike(students.firstName, search), ilike(students.lastName, search), ilike(students.admissionNumber, search)) : undefined,
  );
  const enrollmentConditions = and(
    eq(enrollments.schoolId, context.schoolId),
    eq(enrollments.studentId, students.id),
    eq(enrollments.status, "ACTIVE"),
    filters.classroomId ? eq(enrollments.classroomId, filters.classroomId) : undefined,
    filters.academicYearId ? eq(enrollments.academicYearId, filters.academicYearId) : undefined,
  );
  const conditions = and(studentConditions, filters.classroomId || filters.academicYearId ? sql`${enrollments.id} is not null` : undefined);

  const [rows, totals] = await Promise.all([
    db.select({
      student: students,
      classroomName: classrooms.name,
      academicYearName: academicYears.name,
      guardianFirstName: guardians.firstName,
      guardianLastName: guardians.lastName,
      guardianMobile: guardians.normalizedMobile,
    }).from(students)
      .leftJoin(enrollments, enrollmentConditions)
      .leftJoin(classrooms, and(eq(classrooms.id, enrollments.classroomId), eq(classrooms.schoolId, context.schoolId)))
      .leftJoin(academicYears, and(eq(academicYears.id, enrollments.academicYearId), eq(academicYears.schoolId, context.schoolId)))
      .leftJoin(studentGuardians, and(eq(studentGuardians.studentId, students.id), eq(studentGuardians.schoolId, context.schoolId), eq(studentGuardians.isPrimary, true)))
      .leftJoin(guardians, and(eq(guardians.id, studentGuardians.guardianId), eq(guardians.schoolId, context.schoolId), eq(guardians.status, "ACTIVE")))
      .where(conditions)
      .orderBy(asc(students.lastName), asc(students.firstName), asc(students.admissionNumber), asc(students.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ total: count() }).from(students)
      .leftJoin(enrollments, enrollmentConditions)
      .where(conditions),
  ]);

  return {
    rows: rows.map((row): StudentListRow => ({
      id: row.student.id,
      admissionNumber: row.student.admissionNumber,
      firstName: row.student.firstName,
      lastName: row.student.lastName,
      status: row.student.status,
      classroomName: row.classroomName,
      academicYearName: row.academicYearName,
      guardianName: row.guardianFirstName && row.guardianLastName ? `${row.guardianFirstName} ${row.guardianLastName}` : null,
      guardianMobile: context.role === "SCHOOL_ADMIN" ? maskMobile(row.guardianMobile) : null,
    })),
    total: Number(totals[0]?.total ?? 0),
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export async function getStudent(options: { headers: Headers; studentId: string }) {
  const context = await requireStudentManagementAccess(options.headers);
  return getStudentForContext(context, options.studentId);
}

export async function getStudentForContext(context: ActiveSchoolMembership, studentId: string) {
  const [row] = await getDb().select({ student: students }).from(students).where(and(eq(students.id, studentId), eq(students.schoolId, context.schoolId))).limit(1);
  if (!row) throw new Error("Student not found.");
  return row.student;
}

export async function listStudentGuardiansForContext(context: ActiveSchoolMembership, studentId: string) {
  return getDb().select({ relationship: studentGuardians, guardian: guardians }).from(studentGuardians)
    .innerJoin(guardians, and(eq(guardians.id, studentGuardians.guardianId), eq(guardians.schoolId, context.schoolId)))
    .where(and(eq(studentGuardians.schoolId, context.schoolId), eq(studentGuardians.studentId, studentId)))
    .orderBy(desc(studentGuardians.isPrimary), asc(guardians.lastName), asc(guardians.firstName));
}

export async function listStudentEnrollmentsForContext(context: ActiveSchoolMembership, studentId: string) {
  return getDb().select({ enrollment: enrollments, classroom: classrooms, academicYear: academicYears }).from(enrollments)
    .innerJoin(classrooms, and(eq(classrooms.id, enrollments.classroomId), eq(classrooms.schoolId, context.schoolId)))
    .innerJoin(academicYears, and(eq(academicYears.id, enrollments.academicYearId), eq(academicYears.schoolId, context.schoolId)))
    .where(and(eq(enrollments.schoolId, context.schoolId), eq(enrollments.studentId, studentId)))
    .orderBy(desc(enrollments.startDate));
}

export async function listEffectiveClassroomStudentsForContext(
  context: ActiveSchoolMembership,
  input: { classroomId: string; businessDate: string },
  executor: Pick<ReturnType<typeof getDb>, "select"> = getDb(),
) {
  const parsed = rosterSchema.parse(input);
  const db = executor;
  const conditions = and(
    eq(enrollments.schoolId, context.schoolId),
    eq(enrollments.classroomId, parsed.classroomId),
    eq(enrollments.status, "ACTIVE"),
    lte(enrollments.startDate, parsed.businessDate),
    or(isNull(enrollments.endDate), gt(enrollments.endDate, parsed.businessDate)),
    eq(students.schoolId, context.schoolId),
    eq(students.status, "ACTIVE"),
  );

  if (context.role === "TEACHER") {
    const [assignment] = await db.select({ id: classTeachers.id }).from(classTeachers).where(and(
      eq(classTeachers.schoolId, context.schoolId),
      eq(classTeachers.classroomId, parsed.classroomId),
      eq(classTeachers.teacherMembershipId, context.membershipId),
      eq(classTeachers.status, "ACTIVE"),
      lte(classTeachers.startDate, parsed.businessDate),
      or(isNull(classTeachers.endDate), gt(classTeachers.endDate, parsed.businessDate)),
    )).limit(1);
    if (!assignment) throw new Error("Teacher is not assigned to this classroom.");
  }

  return db.select({
    enrollment: enrollments,
    student: students,
    classroom: classrooms,
  }).from(enrollments).innerJoin(students, and(eq(students.id, enrollments.studentId), eq(students.schoolId, context.schoolId)))
    .innerJoin(classrooms, and(eq(classrooms.id, enrollments.classroomId), eq(classrooms.schoolId, context.schoolId), eq(classrooms.status, "ACTIVE")))
    .where(conditions)
    .orderBy(asc(students.lastName), asc(students.firstName), asc(students.admissionNumber));
}
