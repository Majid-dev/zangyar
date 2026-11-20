import { config } from "dotenv";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { academicYears, auditLogs, classrooms, enrollments, grades, schoolMemberships, schools, students, studentGuardians } from "@/lib/db/schema";
import { createEnrollment, createGuardian, createStudent, linkGuardian, transferEnrollment } from "./services";

config({ path: ".env.local" });
const canRun = Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL && process.env.RUN_DB_INTEGRATION_TESTS === "1");

async function createAuthUser(suffix: string) {
  const auth = (await import("@/lib/auth")).getAuth();
  const email = `phase5-${suffix}-${crypto.randomUUID()}@example.com`;
  const password = "A-secure-password-123!";
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  await auth.handler(new Request(`${baseUrl}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: `Phase 5 ${suffix}`, email, password }) }));
  const response = await auth.handler(new Request(`${baseUrl}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }));
  const body = await response.json();
  const responseHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = responseHeaders.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return { id: body.user.id as string, headers: new Headers({ cookie: cookies.map((cookie) => cookie.split(";", 1)[0]).filter(Boolean).join("; ") }) };
}

describe.skipIf(!canRun)("persisted Phase 5 student management", () => {
  let admin: { id: string; headers: Headers };
  let schoolA: string;
  let schoolB: string;
  let yearA: string;
  let classroomA: string;
  let classroomB: string;
  let studentA: string;
  let guardianA: string;

  beforeAll(async () => {
    admin = await createAuthUser("admin");
    const db = getDb();
    schoolA = (await db.insert(schools).values({ slug: `phase5-a-${crypto.randomUUID()}`, name: "Phase 5 A" }).returning({ id: schools.id }))[0].id;
    schoolB = (await db.insert(schools).values({ slug: `phase5-b-${crypto.randomUUID()}`, name: "Phase 5 B" }).returning({ id: schools.id }))[0].id;
    await db.insert(schoolMemberships).values({ schoolId: schoolA, userId: admin.id, role: "SCHOOL_ADMIN", status: "ACTIVE" });
    yearA = (await db.insert(academicYears).values({ schoolId: schoolA, code: "1405", name: "سال ۱۴۰۵", startDate: "2026-09-23", endDate: "2027-06-21" }).returning({ id: academicYears.id }))[0].id;
    const grade = (await db.insert(grades).values({ schoolId: schoolA, code: "G1", name: "Grade", sortOrder: 1 }).returning({ id: grades.id }))[0].id;
    classroomA = (await db.insert(classrooms).values({ schoolId: schoolA, academicYearId: yearA, gradeId: grade, code: "A", name: "Class A" }).returning({ id: classrooms.id }))[0].id;
    classroomB = (await db.insert(classrooms).values({ schoolId: schoolA, academicYearId: yearA, gradeId: grade, code: "B", name: "Class B" }).returning({ id: classrooms.id }))[0].id;
  });

  it("creates school-local student and guardian records", async () => {
    studentA = (await createStudent({ headers: admin.headers, input: { admissionNumber: " ۱۲۳ ", firstName: "آرین", lastName: "احمدی", nationalId: "۱۲۳۴۵۶۷۸۹۰", birthDate: null } })).id;
    guardianA = (await createGuardian({ headers: admin.headers, input: { firstName: "مریم", lastName: "احمدی", normalizedMobile: "۰۹۱۲۱۲۳۴۵۶۷" } })).id;
    expect((await getDb().select().from(students).where(eq(students.id, studentA)))[0].schoolId).toBe(schoolA);
  });

  it("links one primary guardian and audits the operation", async () => {
    await linkGuardian({ headers: admin.headers, input: { studentId: studentA, guardianId: guardianA, relationshipType: "مادر", isPrimary: true, receivesSms: true, isEmergency: true } });
    const [relationship] = await getDb().select().from(studentGuardians).where(and(eq(studentGuardians.schoolId, schoolA), eq(studentGuardians.studentId, studentA)));
    expect(relationship.isPrimary).toBe(true);
    const events = await getDb().select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.entityId, `${studentA}:${guardianA}`));
    expect(events.map((event) => event.action)).toContain("STUDENT_GUARDIAN_LINKED");
  });

  it("enrolls and transfers without overlapping effective ranges", async () => {
    const initial = await createEnrollment({ headers: admin.headers, input: { studentId: studentA, academicYearId: yearA, classroomId: classroomA, startDate: "2026-09-23", endDate: null } });
    const next = await transferEnrollment({ headers: admin.headers, input: { enrollmentId: initial.id, classroomId: classroomB, startDate: "2027-01-01", endDate: null } });
    expect(next.classroomId).toBe(classroomB);
    const history = await getDb().select().from(enrollments).where(and(eq(enrollments.schoolId, schoolA), eq(enrollments.studentId, studentA)));
    expect(history).toHaveLength(2);
    expect(history.some((enrollment) => enrollment.endDate === "2027-01-01")).toBe(true);
  });

  it("rejects a cross-tenant guardian link", async () => {
    const [otherStudent] = await getDb().insert(students).values({ schoolId: schoolB, admissionNumber: "123", firstName: "Other", lastName: "Student" }).returning();
    await expect(linkGuardian({ headers: admin.headers, input: { studentId: otherStudent.id, guardianId: guardianA, relationshipType: "مادر", isPrimary: true, receivesSms: false, isEmergency: false } })).rejects.toThrow("not found");
  });
});
