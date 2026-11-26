import "server-only";

import { requireSchoolRole, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { assertTeacherHasClassroomAccess } from "@/features/scheduling/policy";
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

/**
 * A teacher may read a classroom's roster when they teach an hour in it; a School
 * Admin may read any classroom in the school. The rule itself lives in the
 * scheduling feature, because that is where the assignments are, and both this
 * module and attendance consult it rather than restating it.
 */
export async function assertTeacherCanReadClassroom(
  context: ActiveSchoolMembership,
  db: QueryExecutor,
  classroomId: string,
) {
  if (context.role === "SCHOOL_ADMIN") return;
  await assertTeacherHasClassroomAccess(context, db, classroomId);
}

export function isDateEffective(startDate: string, endDate: string | null, businessDate: string) {
  return startDate <= businessDate && (endDate === null || businessDate < endDate);
}

export function rangesOverlap(startA: string, endA: string | null, startB: string, endB: string | null) {
  return startA < (endB ?? "9999-12-31") && startB < (endA ?? "9999-12-31");
}
