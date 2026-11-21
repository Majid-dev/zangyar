import "server-only";

import { and, eq, lte, or, isNull, gt } from "drizzle-orm";

import { requireSchoolRole, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { classTeachers } from "@/lib/db/schema";
import type { getDb } from "@/lib/db";

export async function requireStudentManagementAccess(headers: Headers) {
  const context = await requireSchoolRole({ headers, roles: ["SCHOOL_ADMIN"] });
  if (context.school.status !== "ACTIVE") throw new Error("School is not operational.");
  return context;
}

export async function requireStudentReadAccess(headers: Headers) {
  return requireSchoolRole({ headers, roles: ["SCHOOL_ADMIN", "TEACHER"] });
}

type QueryDb = ReturnType<typeof getDb>;
type QueryExecutor = Pick<QueryDb, "select">;

export async function assertTeacherCanReadClassroom(
  context: ActiveSchoolMembership,
  db: QueryExecutor,
  classroomId: string,
  businessDate: string,
) {
  if (context.role === "SCHOOL_ADMIN") return;

  const assignments = await db.select({ id: classTeachers.id })
    .from(classTeachers)
    .where(and(
      eq(classTeachers.schoolId, context.schoolId),
      eq(classTeachers.classroomId, classroomId),
      eq(classTeachers.teacherMembershipId, context.membershipId),
      eq(classTeachers.status, "ACTIVE"),
      lte(classTeachers.startDate, businessDate),
      or(isNull(classTeachers.endDate), gt(classTeachers.endDate, businessDate)),
    ))
    .limit(1);

  if (assignments.length === 0) throw new Error("Teacher is not assigned to this classroom.");
}

export function isDateEffective(startDate: string, endDate: string | null, businessDate: string) {
  return startDate <= businessDate && (endDate === null || businessDate < endDate);
}

export function rangesOverlap(startA: string, endA: string | null, startB: string, endB: string | null) {
  return startA < (endB ?? "9999-12-31") && startB < (endA ?? "9999-12-31");
}
