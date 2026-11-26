import "server-only";

import { and, asc, count, eq, inArray } from "drizzle-orm";

import { requireSchoolAccess, requireSchoolRole, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { academicYears, classrooms, grades, schoolSettings, subjects, timetableEntries, users, schoolMemberships } from "@/lib/db/schema";

export async function getSchoolConfiguration(options: { headers: Headers; schoolId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, schoolId: options.schoolId });
  const [settings] = await getDb().select().from(schoolSettings).where(eq(schoolSettings.schoolId, context.schoolId));
  return { school: context.school, settings: settings ?? null };
}

export async function listAcademicYears(options: { headers: Headers; schoolId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, schoolId: options.schoolId });
  return listAcademicYearsForContext(context);
}

export async function listAcademicYearsForContext(context: ActiveSchoolMembership) {
  return getDb().select().from(academicYears).where(eq(academicYears.schoolId, context.schoolId)).orderBy(asc(academicYears.startDate));
}

export async function listGrades(options: { headers: Headers; schoolId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, schoolId: options.schoolId });
  return listGradesForContext(context);
}

export async function listGradesForContext(context: ActiveSchoolMembership) {
  return getDb().select().from(grades).where(and(eq(grades.schoolId, context.schoolId), eq(grades.status, "ACTIVE"))).orderBy(asc(grades.sortOrder), asc(grades.name));
}

export async function listSubjects(options: { headers: Headers; schoolId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, schoolId: options.schoolId });
  return listSubjectsForContext(context);
}

export async function listSubjectsForContext(context: ActiveSchoolMembership) {
  return getDb().select().from(subjects).where(and(eq(subjects.schoolId, context.schoolId), eq(subjects.status, "ACTIVE"))).orderBy(asc(subjects.name));
}

export async function listClassrooms(options: { headers: Headers; schoolId?: string; academicYearId?: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, schoolId: options.schoolId });
  return listClassroomsForContext(context, options.academicYearId);
}

/**
 * Operational classroom list.
 *
 * Rooms belonging to a closed or archived academic year are excluded: that year
 * is history, and its rooms must not be offered for new enrollments, attendance,
 * or teacher assignment. A draft year stays visible because a school builds next
 * year's structure before activating it. The rows remain in the database, and the
 * student pages still resolve historical classrooms by id, so nothing is lost.
 */
export async function listClassroomsForContext(context: ActiveSchoolMembership, academicYearId?: string) {
  return getDb().select({
    id: classrooms.id,
    schoolId: classrooms.schoolId,
    academicYearId: classrooms.academicYearId,
    gradeId: classrooms.gradeId,
    code: classrooms.code,
    name: classrooms.name,
    capacity: classrooms.capacity,
    status: classrooms.status,
    createdAt: classrooms.createdAt,
    updatedAt: classrooms.updatedAt,
  }).from(classrooms)
    .innerJoin(academicYears, and(
      eq(academicYears.id, classrooms.academicYearId),
      eq(academicYears.schoolId, context.schoolId),
    ))
    .where(and(
      eq(classrooms.schoolId, context.schoolId),
      eq(classrooms.status, "ACTIVE"),
      inArray(academicYears.status, ["DRAFT", "ACTIVE"]),
      academicYearId ? eq(classrooms.academicYearId, academicYearId) : undefined,
    )).orderBy(asc(classrooms.name));
}

/**
 * Classrooms with a count of the timetable hours they hold.
 *
 * This used to also join a homeroom teacher, which no longer exists: the class
 * owns no teacher relationship of its own, because every teacher relationship a
 * class has is one of the timetable hours inside it. A classroom with no hours is
 * therefore a class nobody teaches yet, which is exactly what the count says.
 */
export async function listClassroomsWithTeachersForContext(context: ActiveSchoolMembership) {
  const rows = await getDb().select({
    classroom: classrooms,
  }).from(classrooms)
    .innerJoin(academicYears, and(
      eq(academicYears.id, classrooms.academicYearId),
      eq(academicYears.schoolId, context.schoolId),
    ))
    .where(and(
      eq(classrooms.schoolId, context.schoolId),
      eq(classrooms.status, "ACTIVE"),
      inArray(academicYears.status, ["DRAFT", "ACTIVE"]),
    ))
    .orderBy(asc(classrooms.name));

  // Timetable hour counts come from one grouped query rather than a join, so a
  // classroom with several hours still appears once.
  const slotCounts = await getDb().select({
    classroomId: timetableEntries.classroomId,
    count: count(timetableEntries.id),
  }).from(timetableEntries)
    .where(and(eq(timetableEntries.schoolId, context.schoolId), eq(timetableEntries.status, "ACTIVE")))
    .groupBy(timetableEntries.classroomId);
  const countByClassroom = new Map(slotCounts.map((row) => [row.classroomId, Number(row.count)]));

  return rows.map((row) => ({
    classroom: row.classroom,
    timetableHourCount: countByClassroom.get(row.classroom.id) ?? 0,
  }));
}

export async function listTeacherMemberships(options: { headers: Headers; schoolId?: string }) {
  const context = await requireSchoolRole({ headers: options.headers, schoolId: options.schoolId, roles: ["SCHOOL_ADMIN"] });
  return listTeacherMembershipsForContext(context);
}

export async function listTeacherMembershipsForContext(context: ActiveSchoolMembership) {
  return getDb().select({
    id: schoolMemberships.id,
    userId: schoolMemberships.userId,
    userName: users.name,
    userEmail: users.email,
  }).from(schoolMemberships)
    .innerJoin(users, eq(users.id, schoolMemberships.userId))
    .where(and(
      eq(schoolMemberships.schoolId, context.schoolId),
      eq(schoolMemberships.role, "TEACHER"),
      eq(schoolMemberships.status, "ACTIVE"),
    )).orderBy(asc(users.name));
}
