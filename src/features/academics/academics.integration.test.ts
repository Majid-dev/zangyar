import { config } from "dotenv";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { academicYears, auditLogs, classrooms, enrollments, grades, schoolMemberships, schools, students } from "@/lib/db/schema";
import { createAcademicYear, createClassroom, createGrade, createSubject, assignTeacher, transitionAcademicYear, updateSchoolConfiguration } from "./services";
import { listClassroomsForContext } from "./queries";
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
  let subjectA: string;
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
    subjectA = (await createSubject({ headers: admin.headers, input: { code: "MATH", name: "Mathematics" } })).id;
    classroomA = (await createClassroom({ headers: admin.headers, input: { academicYearId: yearA, gradeId: gradeA, code: "A", name: "Class A", capacity: 30 } })).id;

    const [stored] = await getDb().select({ schoolId: classrooms.schoolId }).from(classrooms).where(eq(classrooms.id, classroomA));
    expect(stored.schoolId).toBe(schoolA);
  });

  it("assigns only an active same-tenant teacher", async () => {
    const assignment = await assignTeacher({ headers: admin.headers, input: { classroomId: classroomA, teacherMembershipId: teacherMembershipA, subjectId: subjectA, startDate: "2026-09-23", isPrimary: true } });
    expect(assignment.schoolId).toBe(schoolA);
  });

  it("rejects duplicate subjectless assignments and out-of-window dates", async () => {
    await expect(assignTeacher({ headers: admin.headers, input: { classroomId: classroomA, teacherMembershipId: teacherMembershipA, startDate: "2026-09-23", isPrimary: false } })).resolves.toBeDefined();
    await expect(assignTeacher({ headers: admin.headers, input: { classroomId: classroomA, teacherMembershipId: teacherMembershipA, startDate: "2026-09-24", isPrimary: false } })).rejects.toThrow("already assigned");
    await expect(assignTeacher({ headers: admin.headers, input: { classroomId: classroomA, teacherMembershipId: teacherMembershipA, startDate: "2020-01-01", isPrimary: false } })).rejects.toThrow("must fit within");
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

});
