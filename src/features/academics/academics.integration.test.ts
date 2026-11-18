import { config } from "dotenv";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { auditLogs, academicYears, classrooms, grades, schoolMemberships, schools } from "@/lib/db/schema";
import { createAcademicYear, createClassroom, createGrade, createSubject, assignTeacher, transitionAcademicYear, updateSchoolConfiguration } from "./services";

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
    await transitionAcademicYear({ headers: admin.headers, input: { academicYearId: yearA, status: "CLOSED" } });
    const auditEvents = await getDb().select({ action: auditLogs.action }).from(auditLogs).where(and(eq(auditLogs.schoolId, schoolA), eq(auditLogs.entityId, yearA)));
    expect(auditEvents.map((event) => event.action)).toContain("ACADEMIC_YEAR_STATUS_CHANGED");
  });

  it("rejects teacher access to admin-only academic operations", async () => {
    await expect(createGrade({ headers: teacher.headers, input: { code: "NO", name: "No access", sortOrder: 0 } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

});
