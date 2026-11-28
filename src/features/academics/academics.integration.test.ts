import { config } from "dotenv";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { academicYears, auditLogs, classrooms, enrollments, grades, schoolMemberships, schools, students } from "@/lib/db/schema";
import { archiveClassroom, createAcademicYear, createClassroom, createGrade, createSubject, transitionAcademicYear, updateClassroom, updateSchoolConfiguration } from "./services";
import { listClassroomsForContext, listClassroomsWithTeachersForContext } from "./queries";
import { createEnrollment } from "@/features/students/services";

config({ path: ".env.local" });

const canRun = Boolean(
  process.env.DATABASE_URL &&
  process.env.BETTER_AUTH_SECRET &&
  process.env.BETTER_AUTH_URL &&
  process.env.RUN_DB_INTEGRATION_TESTS === "1",
);

async function createAuthUser(suffix: string) {
  const auth = (await import("@/lib/auth")).getAuth();
  const email = `phase4-${suffix}-${crypto.randomUUID()}@example.com`;
  const password = "A-secure-password-123!";
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  await auth.handler(new Request(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `Phase 4 ${suffix}`, email, password }),
  }));
  const response = await auth.handler(new Request(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  }));
  const body = await response.json();
  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return {
    id: body.user.id as string,
    headers: new Headers({ cookie: setCookies.map((cookie) => cookie.split(";", 1)[0]).filter(Boolean).join("; ") }),
  };
}

describe.skipIf(!canRun)("persisted Phase 4 school and academic management", () => {
  let admin: { id: string; headers: Headers };
  let teacher: { id: string; headers: Headers };
  let schoolA: string;
  let schoolB: string;
  let yearA: string;
  let yearB: string;
  let gradeA: string;
  let gradeB: string;
  let classroomA: string;
  let teacherMembershipA: string;

  beforeAll(async () => {
    admin = await createAuthUser("admin");
    teacher = await createAuthUser("teacher");
    const db = getDb();

    schoolA = (await db.insert(schools).values({ slug: `phase4-a-${crypto.randomUUID()}`, name: "Phase 4 A" }).returning({ id: schools.id }))[0].id;
    schoolB = (await db.insert(schools).values({ slug: `phase4-b-${crypto.randomUUID()}`, name: "Phase 4 B" }).returning({ id: schools.id }))[0].id;
    yearB = (await db.insert(academicYears).values({ schoolId: schoolB, code: "1405", name: "Other year", startDate: "2026-09-23", endDate: "2027-06-21" }).returning({ id: academicYears.id }))[0].id;
    gradeB = (await db.insert(grades).values({ schoolId: schoolB, code: "G1", name: "Other grade", sortOrder: 1 }).returning({ id: grades.id }))[0].id;
    await db.insert(schoolMemberships).values({ schoolId: schoolA, userId: admin.id, role: "SCHOOL_ADMIN", status: "ACTIVE" });
    teacherMembershipA = (await db.insert(schoolMemberships).values({ schoolId: schoolA, userId: teacher.id, role: "TEACHER", status: "ACTIVE" }).returning({ id: schoolMemberships.id }))[0].id;
  });

  it("creates school configuration and an academic year in the verified tenant", async () => {
    await updateSchoolConfiguration({ headers: admin.headers, input: { name: "Phase 4 Academy", timezone: "Asia/Tehran" } });
    const year = await createAcademicYear({ headers: admin.headers, input: { code: "1405", name: "سال تحصیلی ۱۴۰۵", startDate: "2026-09-23", endDate: "2027-06-21" } });
    yearA = year.id;
    expect(year.schoolId).toBe(schoolA);
  });

  it("creates tenant-scoped grade, subject, and classroom", async () => {
    gradeA = (await createGrade({ headers: admin.headers, input: { code: "G1", name: "Grade 1", sortOrder: 1 } })).id;
    await createSubject({ headers: admin.headers, input: { code: "MATH", name: "Mathematics" } });
    classroomA = (await createClassroom({ headers: admin.headers, input: { academicYearId: yearA, gradeId: gradeA, code: "A", name: "Class A", capacity: 30 } })).id;

    const [stored] = await getDb().select({ schoolId: classrooms.schoolId }).from(classrooms).where(eq(classrooms.id, classroomA));
    expect(stored.schoolId).toBe(schoolA);
  });

  // A classroom no longer names a teacher of its own: its teachers are the
  // timetable hours inside it, so the record kept is that the class carries no
  // teacher column at all rather than that one was cleared.
  it("stores a classroom without any teacher relationship", async () => {
    const [row] = await getDb().select().from(classrooms).where(eq(classrooms.id, classroomA));
    expect(row).not.toHaveProperty("homeroomTeacherMembershipId");
    // The extra membership from the fixture is still a real teacher of the school,
    // which is what makes the absence above a property of the table and not of the
    // fixture being empty.
    const [teacher] = await getDb().select({ id: schoolMemberships.id }).from(schoolMemberships).where(eq(schoolMemberships.id, teacherMembershipA));
    expect(teacher?.id).toBe(teacherMembershipA);
  });

  it("rejects cross-tenant classroom creation", async () => {
    await expect(createClassroom({ headers: admin.headers, input: { academicYearId: yearB, gradeId: gradeB, code: "B", name: "Cross tenant" } })).rejects.toThrow();
    const created = await getDb().select({ id: classrooms.id }).from(classrooms).where(eq(classrooms.academicYearId, yearB));
    expect(created).toHaveLength(0);
  });

  it("enforces academic-year transitions and audit events", async () => {
    await transitionAcademicYear({ headers: admin.headers, input: { academicYearId: yearA, status: "ACTIVE" } });
    const auditEvents = await getDb().select({ action: auditLogs.action }).from(auditLogs).where(and(eq(auditLogs.schoolId, schoolA), eq(auditLogs.entityId, yearA)));
    expect(auditEvents.map((event) => event.action)).toContain("ACADEMIC_YEAR_STATUS_CHANGED");
  });

  /**
   * A school holds at most one ACTIVE year (partial unique index), so a test that
   * needs a different active year first closes whichever one is active — the same
   * sequence an operator performs when rolling over to a new academic year.
   */
  async function activateYear(academicYearId: string) {
    const db = getDb();
    const active = await db.select({ id: academicYears.id }).from(academicYears).where(and(eq(academicYears.schoolId, schoolA), eq(academicYears.status, "ACTIVE")));
    for (const year of active) {
      if (year.id === academicYearId) continue;
      await transitionAcademicYear({ headers: admin.headers, input: { academicYearId: year.id, status: "CLOSED" } });
    }
    await transitionAcademicYear({ headers: admin.headers, input: { academicYearId, status: "ACTIVE" } });
  }

  it("closing a year closes its active enrollments without touching other years or student status", async () => {
    const db = getDb();
    const yearC = await createAcademicYear({ headers: admin.headers, input: { code: "1406", name: "سال تحصیلی ۱۴۰۶", startDate: "2027-09-23", endDate: "2028-06-20" } });
    await activateYear(yearC.id);
    const gradeC = (await createGrade({ headers: admin.headers, input: { code: "G2", name: "Grade 2", sortOrder: 2 } })).id;
    const classroomC = (await createClassroom({ headers: admin.headers, input: { academicYearId: yearC.id, gradeId: gradeC, code: "C", name: "Class C" } })).id;

    // Enrollments are per student per year, so each assertion uses its own student.
    const activeStudent = (await db.insert(students).values({ schoolId: schoolA, admissionNumber: "7001", firstName: "فعال", lastName: "بسته‌شده" }).returning())[0];
    const archivedStudent = (await db.insert(students).values({ schoolId: schoolA, admissionNumber: "7002", firstName: "بایگانی", lastName: "مانده" }).returning())[0];
    const otherYearStudent = (await db.insert(students).values({ schoolId: schoolA, admissionNumber: "7003", firstName: "سال", lastName: "دیگر" }).returning())[0];

    const activeInClosed = (await db.insert(enrollments).values({ schoolId: schoolA, studentId: activeStudent.id, academicYearId: yearC.id, classroomId: classroomC, startDate: "2027-09-23", endDate: null }).returning())[0];
    const alreadyClosed = (await db.insert(enrollments).values({ schoolId: schoolA, studentId: archivedStudent.id, academicYearId: yearC.id, classroomId: classroomC, startDate: "2027-10-01", endDate: "2027-11-01", status: "ARCHIVED" }).returning())[0];
    // An active enrollment belonging to a different year must not be touched.
    const otherYear = (await db.insert(enrollments).values({ schoolId: schoolA, studentId: otherYearStudent.id, academicYearId: yearA, classroomId: classroomA, startDate: "2026-09-23", endDate: null }).returning())[0];

    await transitionAcademicYear({ headers: admin.headers, input: { academicYearId: yearC.id, status: "CLOSED" } });

    const [closedRow] = await db.select().from(enrollments).where(eq(enrollments.id, activeInClosed.id));
    expect(closedRow.status).toBe("ARCHIVED");
    expect(closedRow.endDate).toBe("2028-06-20");

    // A terminal enrollment keeps its own end date rather than being rewritten.
    const [untouched] = await db.select().from(enrollments).where(eq(enrollments.id, alreadyClosed.id));
    expect(untouched.status).toBe("ARCHIVED");
    expect(untouched.endDate).toBe("2027-11-01");

    const [otherYearRow] = await db.select().from(enrollments).where(eq(enrollments.id, otherYear.id));
    expect(otherYearRow.status).toBe("ACTIVE");
    expect(otherYearRow.endDate).toBeNull();

    // The profile is untouched by an academic-year closure.
    for (const student of [activeStudent, archivedStudent, otherYearStudent]) {
      const [profile] = await db.select().from(students).where(eq(students.id, student.id));
      expect(profile.status).toBe("ACTIVE");
    }
  });

  it("rejects new classrooms and enrollments in a closed year", async () => {
    const db = getDb();
    const yearClosed = await createAcademicYear({ headers: admin.headers, input: { code: "1407", name: "سال بسته", startDate: "2028-09-23", endDate: "2029-06-20" } });
    await activateYear(yearClosed.id);
    const gradeD = (await createGrade({ headers: admin.headers, input: { code: "G3", name: "Grade 3", sortOrder: 3 } })).id;
    const classroomD = (await createClassroom({ headers: admin.headers, input: { academicYearId: yearClosed.id, gradeId: gradeD, code: "D", name: "Class D" } })).id;
    const student = (await db.insert(students).values({ schoolId: schoolA, admissionNumber: "7004", firstName: "بسته", lastName: "سال" }).returning())[0];

    await transitionAcademicYear({ headers: admin.headers, input: { academicYearId: yearClosed.id, status: "CLOSED" } });

    await expect(createClassroom({ headers: admin.headers, input: { academicYearId: yearClosed.id, gradeId: gradeD, code: "E", name: "Closed year class" } })).rejects.toThrow("not available");
    await expect(createEnrollment({ headers: admin.headers, input: { studentId: student.id, academicYearId: yearClosed.id, classroomId: classroomD, startDate: "2028-09-23", endDate: null } })).rejects.toThrow("Only an active academic year");
  });

  it("closing a year twice has the effect of closing it once", async () => {
    const db = getDb();
    const yearRepeat = await createAcademicYear({ headers: admin.headers, input: { code: "1409", name: "سال تکراری", startDate: "2030-09-23", endDate: "2031-06-20" } });
    await activateYear(yearRepeat.id);
    const grade = (await createGrade({ headers: admin.headers, input: { code: "G5", name: "Grade 5", sortOrder: 5 } })).id;
    const room = (await createClassroom({ headers: admin.headers, input: { academicYearId: yearRepeat.id, gradeId: grade, code: "G", name: "Repeat room" } })).id;
    const student = (await db.insert(students).values({ schoolId: schoolA, admissionNumber: "7005", firstName: "تکراری", lastName: "بستن" }).returning())[0];
    const enrollment = (await db.insert(enrollments).values({ schoolId: schoolA, studentId: student.id, academicYearId: yearRepeat.id, classroomId: room, startDate: "2030-09-23", endDate: null }).returning())[0];

    await transitionAcademicYear({ headers: admin.headers, input: { academicYearId: yearRepeat.id, status: "CLOSED" } });
    const [afterFirst] = await db.select().from(enrollments).where(eq(enrollments.id, enrollment.id));

    // A repeat closure is a legal no-op: the enrollment must not be rewritten and
    // the operation must not be audited a second time.
    await transitionAcademicYear({ headers: admin.headers, input: { academicYearId: yearRepeat.id, status: "CLOSED" } });
    const [afterSecond] = await db.select().from(enrollments).where(eq(enrollments.id, enrollment.id));

    expect(afterSecond.status).toBe("ARCHIVED");
    expect(afterSecond.endDate).toBe(afterFirst.endDate);
    expect(afterSecond.updatedAt.getTime()).toBe(afterFirst.updatedAt.getTime());

    const sweeps = await db.select({ action: auditLogs.action }).from(auditLogs).where(and(
      eq(auditLogs.schoolId, schoolA),
      eq(auditLogs.entityId, yearRepeat.id),
      eq(auditLogs.action, "ACADEMIC_YEAR_ENROLLMENTS_CLOSED"),
    ));
    expect(sweeps).toHaveLength(1);
  });

  it("hides classrooms of a closed year from the operational list", async () => {
    const db = getDb();
    const yearOpen = await createAcademicYear({ headers: admin.headers, input: { code: "1408", name: "سال باز", startDate: "2029-09-23", endDate: "2030-06-20" } });
    await activateYear(yearOpen.id);
    const grade = (await createGrade({ headers: admin.headers, input: { code: "G4", name: "Grade 4", sortOrder: 4 } })).id;
    const room = (await createClassroom({ headers: admin.headers, input: { academicYearId: yearOpen.id, gradeId: grade, code: "F", name: "Open room" } })).id;

    const [school] = await db.select().from(schools).where(eq(schools.id, schoolA));
    const membership = (await db.select().from(schoolMemberships).where(and(eq(schoolMemberships.schoolId, schoolA), eq(schoolMemberships.userId, admin.id))))[0];
    const context = { membershipId: membership.id, schoolId: schoolA, userId: admin.id, role: "SCHOOL_ADMIN" as const, school };

    expect((await listClassroomsForContext(context)).some((row) => row.id === room)).toBe(true);
    await transitionAcademicYear({ headers: admin.headers, input: { academicYearId: yearOpen.id, status: "CLOSED" } });
    expect((await listClassroomsForContext(context)).some((row) => row.id === room)).toBe(false);
    // Historical rows survive: only the operational listing hides them.
    expect((await db.select().from(classrooms).where(eq(classrooms.id, room))).length).toBe(1);
  });

  it("rejects teacher access to admin-only academic operations", async () => {
    await expect(createGrade({ headers: teacher.headers, input: { code: "NO", name: "No access", sortOrder: 0 } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  /**
   * A context for the classroom reads, rebuilt per test since the membership is what
   * carries the tenant and the role.
   */
  // Codes unique to this run's classroom tests. The suite builds one school, so two
  // tests choosing the same year or grade code collide on the school-scoped unique
  // index — the suffix is what keeps these independent of every other test's choices.
  const uniq = crypto.randomUUID().slice(0, 6);

  async function adminContext() {
    const db = getDb();
    const [school] = await db.select().from(schools).where(eq(schools.id, schoolA));
    const membership = (await db.select().from(schoolMemberships).where(and(eq(schoolMemberships.schoolId, schoolA), eq(schoolMemberships.userId, admin.id))))[0];
    return { membershipId: membership.id, schoolId: schoolA, userId: admin.id, role: "SCHOOL_ADMIN" as const, school };
  }

  it("edits a class in place and records what it was", async () => {
    const db = getDb();
    const yearOpen = await createAcademicYear({ headers: admin.headers, input: { code: `EY-${uniq}`, name: "سال ویرایش", startDate: "2030-09-23", endDate: "2031-06-20" } });
    await activateYear(yearOpen.id);
    const gradeOne = (await createGrade({ headers: admin.headers, input: { code: `G1-${uniq}`, name: "پایه ویرایش یک", sortOrder: 1 } })).id;
    const gradeTwo = (await createGrade({ headers: admin.headers, input: { code: `G2-${uniq}`, name: "پایه ویرایش دو", sortOrder: 2 } })).id;
    const room = (await createClassroom({ headers: admin.headers, input: { academicYearId: yearOpen.id, gradeId: gradeOne, code: `EA-${uniq}`, name: "کلاس ویرایش", capacity: 20 } })).id;

    const updated = await updateClassroom({ headers: admin.headers, input: {
      classroomId: room, gradeId: gradeTwo, code: `EB-${uniq}`, name: "کلاس ویرایش‌شده", capacity: 25,
    } });
    expect(updated).toMatchObject({ id: room, code: `EB-${uniq}`, name: "کلاس ویرایش‌شده", capacity: 25, gradeId: gradeTwo });
    // The academic year is not editable, so the update left it where it was.
    expect(updated.academicYearId).toBe(yearOpen.id);

    // The rename is audited with both the old and the new values, which is the only
    // place the previous name survives.
    const [event] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.schoolId, schoolA), eq(auditLogs.entityId, room), eq(auditLogs.action, "CLASSROOM_UPDATED"),
    ));
    expect(event).toBeDefined();
    expect(event.metadata).toMatchObject({
      before: { code: `EA-${uniq}`, name: "کلاس ویرایش", gradeId: gradeOne, capacity: 20 },
      after: { code: `EB-${uniq}`, name: "کلاس ویرایش‌شده", gradeId: gradeTwo, capacity: 25 },
    });
  });

  it("refuses to move a class onto another school's grade", async () => {
    const db = getDb();
    const [room] = await db.select().from(classrooms).where(and(eq(classrooms.schoolId, schoolA), eq(classrooms.code, `EB-${uniq}`)));
    // gradeB belongs to school B: the id is a bare uuid, so the service's own check is
    // what makes "this class's grade" a tenant-scoped fact.
    await expect(updateClassroom({ headers: admin.headers, input: {
      classroomId: room.id, gradeId: gradeB, code: room.code, name: room.name, capacity: null,
    } })).rejects.toThrow("Grade is not available for classrooms.");
    const [after] = await db.select().from(classrooms).where(eq(classrooms.id, room.id));
    expect(after.gradeId).not.toBe(gradeB);
  });

  it("archives a class rather than deleting it, and keeps its records", async () => {
    const db = getDb();
    const context = await adminContext();
    const [room] = await db.select().from(classrooms).where(and(eq(classrooms.schoolId, schoolA), eq(classrooms.code, `EB-${uniq}`)));

    await archiveClassroom({ headers: admin.headers, input: { itemId: room.id } });
    const [archived] = await db.select().from(classrooms).where(eq(classrooms.id, room.id));
    expect(archived.status).toBe("ARCHIVED");
    // The row is still there: archiving takes the class out of the lists, not out of
    // the database, so enrollments and timetable rows that reference it still resolve.
    expect(archived.name).toBe(room.name);
    expect((await db.select().from(auditLogs).where(and(
      eq(auditLogs.schoolId, schoolA), eq(auditLogs.entityId, room.id), eq(auditLogs.action, "CLASSROOM_ARCHIVED"),
    ))).length).toBe(1);

    // Archiving twice is the same as archiving once, not an error.
    await archiveClassroom({ headers: admin.headers, input: { itemId: room.id } });
    expect((await db.select().from(auditLogs).where(and(
      eq(auditLogs.schoolId, schoolA), eq(auditLogs.entityId, room.id), eq(auditLogs.action, "CLASSROOM_ARCHIVED"),
    ))).length).toBe(1);

    // And it is gone from the operational list the page reads.
    const listed = await listClassroomsWithTeachersForContext(context);
    expect(listed.some((row) => row.classroom.id === room.id)).toBe(false);
  });

  it("refuses to archive a class that still has students enrolled", async () => {
    const db = getDb();
    const context = await adminContext();
    const [yearOpen] = await db.select().from(academicYears).where(and(eq(academicYears.schoolId, schoolA), eq(academicYears.code, `EY-${uniq}`)));
    const [grade] = await db.select().from(grades).where(and(eq(grades.schoolId, schoolA), eq(grades.code, `G2-${uniq}`)));
    const room = (await createClassroom({ headers: admin.headers, input: { academicYearId: yearOpen.id, gradeId: grade.id, code: `EC-${uniq}`, name: "کلاس دارای دانش‌آموز" } })).id;
    const student = (await db.insert(students).values({ schoolId: schoolA, admissionNumber: `E-${crypto.randomUUID().slice(0, 8)}`, firstName: "زهرا", lastName: "ویرایش" }).returning())[0];
    await createEnrollment({ headers: admin.headers, input: { studentId: student.id, academicYearId: yearOpen.id, classroomId: room, startDate: "2030-09-23", endDate: null } });

    await expect(archiveClassroom({ headers: admin.headers, input: { itemId: room } }))
      .rejects.toThrow("Classroom still has enrolled students.");
    const [still] = await db.select().from(classrooms).where(eq(classrooms.id, room));
    expect(still.status).toBe("ACTIVE");

    // The count the confirmation dialog states comes from the same list read.
    const listed = await listClassroomsWithTeachersForContext(context);
    expect(listed.find((row) => row.classroom.id === room)?.enrolledCount).toBe(1);
  });

  it("searches classes by name, code, and grade", async () => {
    const context = await adminContext();
    const all = await listClassroomsWithTeachersForContext(context);
    expect(all.length).toBeGreaterThan(0);

    // By name.
    const byName = await listClassroomsWithTeachersForContext(context, { search: "کلاس دارای" });
    expect(byName.length).toBeGreaterThan(0);
    expect(byName.every((row) => row.classroom.name.includes("کلاس دارای"))).toBe(true);

    // By code, which is stored in Latin letters and typed the same way.
    const byCode = await listClassroomsWithTeachersForContext(context, { search: `EC-${uniq}` });
    expect(byCode.map((row) => row.classroom.code)).toContain(`EC-${uniq}`);

    // By grade name: the term matches the grade, not the class's own columns, which is
    // the whole point of searching the join.
    const byGrade = await listClassroomsWithTeachersForContext(context, { search: "پایه ویرایش دو" });
    expect(byGrade.length).toBeGreaterThan(0);
    expect(byGrade.every((row) => row.gradeName === "پایه ویرایش دو")).toBe(true);

    // A term that matches nothing yields nothing rather than the whole list.
    expect(await listClassroomsWithTeachersForContext(context, { search: "چیزی که وجود ندارد" })).toHaveLength(0);
  });

  it("rejects teacher access to classroom edits", async () => {
    const db = getDb();
    const [room] = await db.select().from(classrooms).where(and(eq(classrooms.schoolId, schoolA), eq(classrooms.code, `EC-${uniq}`)));
    await expect(updateClassroom({ headers: teacher.headers, input: {
      classroomId: room.id, gradeId: room.gradeId, code: `HACK-${uniq}`, name: "Hacked",
    } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(archiveClassroom({ headers: teacher.headers, input: { itemId: room.id } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

});
