import "server-only";

import { and, asc, count, desc, eq, gt, ilike, isNull, lte, or, sql } from "drizzle-orm";

import { requireStudentManagementAccess, requireStudentReadAccess, assertTeacherCanReadClassroom } from "./policy";
import { maskMobile } from "./normalization";
import { studentListFilterSchema, rosterSchema, type StudentListFilter } from "./schema";
import { getDb } from "@/lib/db";
import { academicYears, classrooms, enrollments, guardians, studentGuardians, students } from "@/lib/db/schema";
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
  const studentTerm = filters.name ?? filters.search;
  const namePattern = studentTerm ? `%${studentTerm}%` : undefined;
  const admissionPattern = filters.admission ? `%${filters.admission}%` : undefined;
  const guardianPattern = filters.guardian ? `%${filters.guardian}%` : undefined;

  // One effective enrollment per student: a student can hold an ACTIVE row for
  // more than one academic year, and joining them all would repeat the student
  // in the list and inflate the total. The most recent start date wins.
  const effectiveEnrollment = db.selectDistinctOn([enrollments.studentId], {
    studentId: enrollments.studentId,
    id: enrollments.id,
    classroomId: enrollments.classroomId,
    academicYearId: enrollments.academicYearId,
  }).from(enrollments).where(and(
    eq(enrollments.schoolId, context.schoolId),
    eq(enrollments.status, "ACTIVE"),
    filters.classroomId ? eq(enrollments.classroomId, filters.classroomId) : undefined,
    filters.academicYearId ? eq(enrollments.academicYearId, filters.academicYearId) : undefined,
  )).orderBy(asc(enrollments.studentId), desc(enrollments.startDate)).as("effective_enrollment");

  const guardianJoinConditions = and(
    eq(studentGuardians.studentId, students.id),
    eq(studentGuardians.schoolId, context.schoolId),
    eq(studentGuardians.isPrimary, true),
  );
  const guardianFilter = guardianPattern ? or(ilike(guardians.firstName, guardianPattern), ilike(guardians.lastName, guardianPattern)) : undefined;
  const enrollmentFilterRequested = Boolean(filters.classroomId || filters.academicYearId || filters.unenrolled);
  const conditions = and(
    eq(students.schoolId, context.schoolId),
    filters.status ? eq(students.status, filters.status) : undefined,
    namePattern ? or(ilike(students.firstName, namePattern), ilike(students.lastName, namePattern)) : undefined,
    admissionPattern ? ilike(students.admissionNumber, admissionPattern) : undefined,
    enrollmentFilterRequested
      ? filters.unenrolled
        ? sql`${effectiveEnrollment.id} is null`
        : sql`${effectiveEnrollment.id} is not null`
      : undefined,
    guardianFilter,
  );

  const [rows, totals] = await Promise.all([
    db.select({
      student: students,
      classroomName: classrooms.name,
      academicYearName: academicYears.name,
      guardianFirstName: guardians.firstName,
      guardianLastName: guardians.lastName,
      guardianMobile: guardians.normalizedMobile,
    }).from(students)
      .leftJoin(effectiveEnrollment, eq(effectiveEnrollment.studentId, students.id))
      .leftJoin(classrooms, and(eq(classrooms.id, effectiveEnrollment.classroomId), eq(classrooms.schoolId, context.schoolId)))
      .leftJoin(academicYears, and(eq(academicYears.id, effectiveEnrollment.academicYearId), eq(academicYears.schoolId, context.schoolId)))
      .leftJoin(studentGuardians, guardianJoinConditions)
      .leftJoin(guardians, and(eq(guardians.id, studentGuardians.guardianId), eq(guardians.schoolId, context.schoolId), eq(guardians.status, "ACTIVE")))
      .where(conditions)
      .orderBy(...orderFor(filters.sort, filters.dir))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ total: count() }).from(students)
      .leftJoin(effectiveEnrollment, eq(effectiveEnrollment.studentId, students.id))
      .leftJoin(studentGuardians, guardianJoinConditions)
      .leftJoin(guardians, and(eq(guardians.id, studentGuardians.guardianId), eq(guardians.schoolId, context.schoolId), eq(guardians.status, "ACTIVE")))
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

/**
 * Sort columns are whitelisted by the filter schema, so this maps a validated
 * key to a SQL column and never interpolates unsanitized input. `students.id`
 * is always the final tiebreaker so pagination cannot drop or repeat a row.
 */
function orderFor(sort: StudentListFilter["sort"], dir: StudentListFilter["dir"]) {
  const direction = dir === "desc" ? desc : asc;
  switch (sort) {
    case "admission": return [direction(students.admissionNumber), asc(students.id)];
    case "classroom": return [direction(classrooms.name), asc(students.lastName), asc(students.id)];
    case "guardian": return [direction(guardians.lastName), asc(students.lastName), asc(students.id)];
    case "status": return [direction(students.status), asc(students.lastName), asc(students.id)];
    default: return [direction(students.lastName), direction(students.firstName), asc(students.id)];
  }
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
    await assertTeacherCanReadClassroom(context, db, parsed.classroomId);
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
