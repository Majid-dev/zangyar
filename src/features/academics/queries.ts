import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { requireSchoolAccess } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { academicYears, classTeachers, classrooms, grades, schoolSettings, subjects, users, schoolMemberships } from "@/lib/db/schema";

export async function getSchoolConfiguration(options: { headers: Headers; schoolId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, schoolId: options.schoolId });
  const [settings] = await getDb().select().from(schoolSettings).where(eq(schoolSettings.schoolId, context.schoolId));
  return { school: context.school, settings: settings ?? null };
}

export async function listAcademicYears(options: { headers: Headers; schoolId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, schoolId: options.schoolId });
  return getDb().select().from(academicYears).where(eq(academicYears.schoolId, context.schoolId)).orderBy(asc(academicYears.startDate));
}

export async function listGrades(options: { headers: Headers; schoolId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, schoolId: options.schoolId });
  return getDb().select().from(grades).where(eq(grades.schoolId, context.schoolId)).orderBy(asc(grades.sortOrder), asc(grades.name));
}

export async function listSubjects(options: { headers: Headers; schoolId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, schoolId: options.schoolId });
  return getDb().select().from(subjects).where(eq(subjects.schoolId, context.schoolId)).orderBy(asc(subjects.name));
}

export async function listClassrooms(options: { headers: Headers; schoolId?: string; academicYearId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, schoolId: options.schoolId });
  return getDb().select().from(classrooms).where(and(
    eq(classrooms.schoolId, context.schoolId),
    options.academicYearId ? eq(classrooms.academicYearId, options.academicYearId) : undefined,
  )).orderBy(asc(classrooms.name));
}

export async function listClassroomTeachers(options: { headers: Headers; schoolId?: string; classroomId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, schoolId: options.schoolId });
  return getDb().select({
    assignment: classTeachers,
    teacher: users,
    membership: schoolMemberships,
  }).from(classTeachers)
    .innerJoin(schoolMemberships, and(
      eq(schoolMemberships.id, classTeachers.teacherMembershipId),
      eq(schoolMemberships.schoolId, context.schoolId),
    ))
    .innerJoin(users, eq(users.id, schoolMemberships.userId))
    .where(and(
      eq(classTeachers.schoolId, context.schoolId),
      options.classroomId ? eq(classTeachers.classroomId, options.classroomId) : undefined,
    ));
}
