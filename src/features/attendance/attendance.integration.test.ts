import { config } from "dotenv";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { academicYears, attendanceRecords, attendanceSessions, classrooms, enrollments, grades, schoolMemberships, schools, students, users } from "@/lib/db/schema";
import { submitAttendanceForContext } from "./services";

config({ path: ".env.local" });
const canRun = Boolean(process.env.DATABASE_URL && process.env.RUN_DB_INTEGRATION_TESTS === "1");

describe.skipIf(!canRun)("persisted Phase 6 attendance", () => {
  let context: { membershipId: string; schoolId: string; userId: string; role: "SCHOOL_ADMIN"; school: typeof schools.$inferSelect };
  let classroomId: string;
  let enrollmentId: string;

  beforeAll(async () => {
    const db = getDb();
    const [school] = await db.insert(schools).values({ slug: `phase6-${crypto.randomUUID()}`, name: "Phase 6 School" }).returning();
    const userId = `phase6-user-${crypto.randomUUID()}`;
    await db.insert(users).values({ id: userId, name: "Phase 6 Admin", email: `${userId}@example.com`, emailVerified: true });
    const [membership] = await db.insert(schoolMemberships).values({ schoolId: school.id, userId, role: "SCHOOL_ADMIN", status: "ACTIVE" }).returning();
    const [year] = await db.insert(academicYears).values({ schoolId: school.id, code: "1405", name: "سال فعال", startDate: "2026-09-23", endDate: "2027-06-21", status: "ACTIVE" }).returning();
    const [grade] = await db.insert(grades).values({ schoolId: school.id, code: "G1", name: "پایه اول" }).returning();
    const [classroom] = await db.insert(classrooms).values({ schoolId: school.id, academicYearId: year.id, gradeId: grade.id, code: "A", name: "کلاس اول" }).returning();
    const [student] = await db.insert(students).values({ schoolId: school.id, admissionNumber: "1", firstName: "آرین", lastName: "احمدی" }).returning();
    const enrollment = await db.insert(enrollments).values({ schoolId: school.id, studentId: student.id, academicYearId: year.id, classroomId: classroom.id, startDate: "2026-09-23" }).returning();
    context = { membershipId: membership.id, schoolId: school.id, userId, role: "SCHOOL_ADMIN", school };
    classroomId = classroom.id;
    enrollmentId = enrollment[0].id;
  });

  it("persists one daily session and attendance record", async () => {
    await submitAttendanceForContext(context, { classroomId, businessDate: "2026-11-20", records: [{ enrollmentId, status: "PRESENT" }] });
    const db = getDb();
    expect(await db.select().from(attendanceSessions).where(and(eq(attendanceSessions.schoolId, context.schoolId), eq(attendanceSessions.classroomId, classroomId)))).toHaveLength(1);
    expect(await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.schoolId, context.schoolId), eq(attendanceRecords.enrollmentId, enrollmentId)))).toHaveLength(1);
  });
});
