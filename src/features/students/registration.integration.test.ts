import { config } from "dotenv";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { academicYears, classrooms, enrollments, grades, guardians, schoolMemberships, schools, studentGuardians, students } from "@/lib/db/schema";
import { createAndLinkGuardian, createEnrollment, registerStudent } from "./services";
import { listStudentsForContext } from "./queries";

config({ path: ".env.local" });
const canRun = Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL && process.env.RUN_DB_INTEGRATION_TESTS === "1");

/**
 * Persisted coverage for the guided registration workflow.
 * Uses a real authenticated session because registration goes through the same
 * tenant-authorized service boundary the Server Action calls.
 */
async function createAuthUser(suffix: string) {
  const auth = (await import("@/lib/auth")).getAuth();
  const email = `reg-${suffix}-${crypto.randomUUID()}@example.com`;
  const password = "A-secure-password-123!";
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  await auth.handler(new Request(`${baseUrl}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: `Reg ${suffix}`, email, password }) }));
  const response = await auth.handler(new Request(`${baseUrl}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }));
  const body = await response.json();
  const responseHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = responseHeaders.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return { id: body.user.id as string, headers: new Headers({ cookie: cookies.map((cookie) => cookie.split(";", 1)[0]).filter(Boolean).join("; ") }) };
}

describe.skipIf(!canRun)("persisted student registration workflow", () => {
  let admin: { id: string; headers: Headers };
  let schoolId: string;
  let otherSchoolId: string;
  let yearA: string;
  let yearB: string;
  let classroomA: string;
  let classroomOtherSchool: string;
  let roomB: string;

  beforeAll(async () => {
    admin = await createAuthUser("admin");
    const db = getDb();
    const [school] = await db.insert(schools).values({ slug: `reg-${crypto.randomUUID()}`, name: "Registration School" }).returning();
    const [otherSchool] = await db.insert(schools).values({ slug: `reg-other-${crypto.randomUUID()}`, name: "Other School" }).returning();
    await db.insert(schoolMemberships).values({ schoolId: school.id, userId: admin.id, role: "SCHOOL_ADMIN", status: "ACTIVE" });
    const [grade] = await db.insert(grades).values({ schoolId: school.id, code: "G1", name: "پایه اول" }).returning();
    const [otherGrade] = await db.insert(grades).values({ schoolId: otherSchool.id, code: "G1", name: "پایه اول" }).returning();
    const [rowA] = await db.insert(academicYears).values({ schoolId: school.id, code: "1405", name: "سال ۱۴۰۵", startDate: "2026-09-23", endDate: "2027-06-21", status: "ACTIVE" }).returning();
    const [rowB] = await db.insert(academicYears).values({ schoolId: school.id, code: "1406", name: "سال ۱۴۰۶", startDate: "2027-09-23", endDate: "2028-06-20", status: "DRAFT" }).returning();
    const [otherYear] = await db.insert(academicYears).values({ schoolId: otherSchool.id, code: "1405", name: "سال ۱۴۰۵", startDate: "2026-09-23", endDate: "2027-06-21", status: "ACTIVE" }).returning();
    const [roomA] = await db.insert(classrooms).values({ schoolId: school.id, academicYearId: rowA.id, gradeId: grade.id, code: "A", name: "کلاس الف" }).returning();
    const [roomNext] = await db.insert(classrooms).values({ schoolId: school.id, academicYearId: rowB.id, gradeId: grade.id, code: "A2", name: "کلاس ۱۴۰۶" }).returning();
    const [otherRoom] = await db.insert(classrooms).values({ schoolId: otherSchool.id, academicYearId: otherYear.id, gradeId: otherGrade.id, code: "A", name: "کلاس دیگر" }).returning();
    schoolId = school.id;
    otherSchoolId = otherSchool.id;
    yearA = rowA.id;
    yearB = rowB.id;
    classroomA = roomA.id;
    roomB = roomNext.id;
    classroomOtherSchool = otherRoom.id;
  });

  it("registers a profile with two guardians and an enrollment in one transaction", async () => {
    const result = await registerStudent({
      headers: admin.headers,
      input: {
        student: { admissionNumber: "۱۰۰۱", firstName: "آرین", lastName: "احمدی", nationalId: null, birthDate: "2018-04-11" },
        guardians: [
          { firstName: "مریم", lastName: "احمدی", normalizedMobile: "09120000001", email: null, relationshipType: "مادر", isPrimary: true, receivesSms: true, isEmergency: false },
          { firstName: "حسن", lastName: "احمدی", normalizedMobile: "09120000002", email: "hasan@example.com", relationshipType: "پدر", isPrimary: false, receivesSms: false, isEmergency: true },
        ],
        enrollment: { academicYearId: yearA, classroomId: classroomA, startDate: "2026-09-23", endDate: null },
      },
    });

    expect(result.student.admissionNumber).toBe("1001");
    expect(result.guardians).toHaveLength(2);
    expect(result.enrollment?.classroomId).toBe(classroomA);

    const stored = await getDb().select().from(studentGuardians).where(and(eq(studentGuardians.schoolId, schoolId), eq(studentGuardians.studentId, result.student.id)));
    expect(stored).toHaveLength(2);
    expect(stored.filter((row) => row.isPrimary)).toHaveLength(1);
    const [emailGuardian] = await getDb().select().from(guardians).where(and(eq(guardians.schoolId, schoolId), eq(guardians.normalizedMobile, "09120000002")));
    expect(emailGuardian.email).toBe("hasan@example.com");
  });

  it("reuses an existing guardian record for a sibling instead of duplicating it", async () => {
    const before = await getDb().select().from(guardians).where(and(eq(guardians.schoolId, schoolId), eq(guardians.normalizedMobile, "09120000001")));
    expect(before).toHaveLength(1);

    const sibling = await registerStudent({
      headers: admin.headers,
      input: {
        student: { admissionNumber: "۱۰۰۲", firstName: "سارا", lastName: "احمدی", nationalId: null, birthDate: null },
        guardians: [{ firstName: "نام", lastName: "متفاوت", normalizedMobile: "09120000001", email: null, relationshipType: "مادر", isPrimary: true, receivesSms: true, isEmergency: false }],
        enrollment: null,
      },
    });

    const after = await getDb().select().from(guardians).where(and(eq(guardians.schoolId, schoolId), eq(guardians.normalizedMobile, "09120000001")));
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[0].id);
    // Sibling reuses the contact and does not overwrite the stored name.
    expect(after[0].firstName).toBe("مریم");

    const link = await getDb().select().from(studentGuardians).where(and(eq(studentGuardians.schoolId, schoolId), eq(studentGuardians.studentId, sibling.student.id)));
    expect(link).toHaveLength(1);
    expect(link[0].guardianId).toBe(before[0].id);
  });

  it("prevents a duplicate active enrollment in the same academic year", async () => {
    const [existing] = await getDb().select().from(students).where(and(eq(students.schoolId, schoolId), eq(students.admissionNumber, "1001")));
    await expect(createEnrollment({ headers: admin.headers, input: { studentId: existing.id, academicYearId: yearA, classroomId: classroomA, startDate: "2026-10-01", endDate: null } })).rejects.toThrow(/overlap/i);
  });

  it("rejects an enrollment into another tenant's classroom", async () => {
    const [existing] = await getDb().select().from(students).where(and(eq(students.schoolId, schoolId), eq(students.admissionNumber, "1001")));
    await expect(createEnrollment({ headers: admin.headers, input: { studentId: existing.id, academicYearId: yearA, classroomId: classroomOtherSchool, startDate: "2026-09-23", endDate: null } })).rejects.toThrow();
  });

  it("links a newly created guardian from the profile panel, reusing a known mobile", async () => {
    const [student] = await getDb().insert(students).values({ schoolId, admissionNumber: "1003", firstName: "نیما", lastName: "کریمی" }).returning();
    const linked = await createAndLinkGuardian({
      headers: admin.headers,
      input: { studentId: student.id, firstName: "زهرا", lastName: "کریمی", normalizedMobile: "09120000009", email: null, relationshipType: "مادر", isPrimary: true, receivesSms: true, isEmergency: false },
    });
    expect(linked.guardian.normalizedMobile).toBe("09120000009");

    const reused = await createAndLinkGuardian({
      headers: admin.headers,
      input: { studentId: student.id, firstName: "زهرا", lastName: "کریمی", normalizedMobile: "۰۹۱۲۰۰۰۰۰۰۹", email: null, relationshipType: "سرپرست", isPrimary: false, receivesSms: true, isEmergency: false },
    });
    expect(reused.guardian.id).toBe(linked.guardian.id);
  });

  it("enrolls an existing student into a later academic year without duplicating the profile", async () => {
    const [existing] = await getDb().select().from(students).where(and(eq(students.schoolId, schoolId), eq(students.admissionNumber, "1001")));
    const profilesBefore = await getDb().select().from(students).where(eq(students.schoolId, schoolId));

    // A school may hold only one ACTIVE year, so the new year is opened the way
    // an operator would: close the current year, then activate the next one.
    await getDb().update(academicYears).set({ status: "CLOSED" }).where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.id, yearA)));
    await getDb().update(academicYears).set({ status: "ACTIVE" }).where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.id, yearB)));

    await createEnrollment({ headers: admin.headers, input: { studentId: existing.id, academicYearId: yearB, classroomId: roomB, startDate: "2027-09-23", endDate: null } });

    const rows = await getDb().select().from(enrollments).where(and(eq(enrollments.schoolId, schoolId), eq(enrollments.studentId, existing.id)));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.academicYearId)).size).toBe(2);
    // One profile, two enrollments: enrollment history lives apart from identity.
    const profilesAfter = await getDb().select().from(students).where(eq(students.schoolId, schoolId));
    expect(profilesAfter).toHaveLength(profilesBefore.length);
  });

  it("filters student list by independent columns without leaking another tenant", async () => {
    const [foreign] = await getDb().insert(students).values({ schoolId: otherSchoolId, admissionNumber: "9001", firstName: "بیگانه", lastName: "خارجی" }).returning();
    const [school] = await getDb().select().from(schools).where(eq(schools.id, schoolId));
    const membership = (await getDb().select().from(schoolMemberships).where(and(eq(schoolMemberships.schoolId, schoolId), eq(schoolMemberships.userId, admin.id))))[0];
    const context = { membershipId: membership.id, schoolId, userId: admin.id, role: "SCHOOL_ADMIN" as const, school };
    const filtered = await listStudentsForContext(context, { name: "آرین", admission: "1001", guardian: "مریم", sort: "name", dir: "asc", unenrolled: false, page: 1, pageSize: 25 });
    expect(filtered.rows.some((row) => row.firstName === "آرین" && row.admissionNumber === "1001")).toBe(true);
    expect(filtered.rows.some((row) => row.id === foreign.id)).toBe(false);
  });

  it("rejects registration from an account without school membership", async () => {
    const outsider = await createAuthUser("outsider");
    await expect(registerStudent({
      headers: outsider.headers,
      input: { student: { admissionNumber: "2001", firstName: "بدون", lastName: "دسترسی", nationalId: null, birthDate: null }, guardians: [], enrollment: null },
    })).rejects.toThrow();
  });
});
