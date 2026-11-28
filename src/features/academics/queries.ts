import "server-only";

import { and, asc, count, eq, ilike, inArray, or } from "drizzle-orm";

import { requireSchoolAccess, requireSchoolRole, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { academicYears, classrooms, enrollments, grades, schoolSettings, subjects, timetableEntries, users, schoolMemberships } from "@/lib/db/schema";

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
/**
 * The school's classes, with how much of each is scheduled.
 *
 * `search` is one free-text term matched against three things at once — the class's
 * name, its code, and the name and code of its grade — because someone looking for a
 * class types "دهم" or "A" without first deciding which column that is. The match is
 * made in SQL rather than over the returned rows: the list is the page's main content,
 * and filtering it in the query is what keeps the payload the size of what is shown.
 *
 * The grade is joined rather than looked up per row so the search and the returned
 * name both come from the same read. An archived grade is not excluded here the way
 * the grade picker excludes it: a class filed under a grade that was retired is still
 * a real class with a real timetable, and hiding it from the classroom list would
 * leave the row visible nowhere.
 */
export async function listClassroomsWithTeachersForContext(context: ActiveSchoolMembership, options: { search?: string } = {}) {
  const term = options.search?.trim();
  const pattern = term ? `%${term}%` : undefined;
  const rows = await getDb().select({
    classroom: classrooms,
    gradeName: grades.name,
    gradeCode: grades.code,
  }).from(classrooms)
    .innerJoin(academicYears, and(
      eq(academicYears.id, classrooms.academicYearId),
      eq(academicYears.schoolId, context.schoolId),
    ))
    .innerJoin(grades, and(
      eq(grades.id, classrooms.gradeId),
      eq(grades.schoolId, context.schoolId),
    ))
    .where(and(
      eq(classrooms.schoolId, context.schoolId),
      eq(classrooms.status, "ACTIVE"),
      inArray(academicYears.status, ["DRAFT", "ACTIVE"]),
      pattern
        ? or(
          ilike(classrooms.name, pattern),
          ilike(classrooms.code, pattern),
          ilike(grades.name, pattern),
          ilike(grades.code, pattern),
        )
        : undefined,
    ))
    .orderBy(asc(grades.sortOrder), asc(classrooms.name));

  // Timetable hour counts come from one grouped query rather than a join, so a
  // classroom with several hours still appears once.
  const slotCounts = await getDb().select({
    classroomId: timetableEntries.classroomId,
    count: count(timetableEntries.id),
  }).from(timetableEntries)
    .where(and(eq(timetableEntries.schoolId, context.schoolId), eq(timetableEntries.status, "ACTIVE")))
    .groupBy(timetableEntries.classroomId);
  const countByClassroom = new Map(slotCounts.map((row) => [row.classroomId, Number(row.count)]));

  // The enrolled headcount, for the same reason: one grouped read, and it is what the
  // delete confirmation needs to say who would be affected.
  const enrollmentCounts = await getDb().select({
    classroomId: enrollments.classroomId,
    count: count(enrollments.id),
  }).from(enrollments)
    .where(and(eq(enrollments.schoolId, context.schoolId), eq(enrollments.status, "ACTIVE")))
    .groupBy(enrollments.classroomId);
  const enrolledByClassroom = new Map(enrollmentCounts.map((row) => [row.classroomId, Number(row.count)]));

  return rows.map((row) => ({
    classroom: row.classroom,
    gradeName: row.gradeName,
    timetableHourCount: countByClassroom.get(row.classroom.id) ?? 0,
    enrolledCount: enrolledByClassroom.get(row.classroom.id) ?? 0,
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
