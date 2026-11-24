import "server-only";

import { requireSchoolRole } from "@/lib/auth/authorization";

/**
 * Teacher management is an operational School Admin capability, so it is gated
 * the same way student management is: an active School Admin membership in an
 * operational school. A suspended school is readable but not operable.
 */
export async function requireTeacherManagementAccess(headers: Headers) {
  const context = await requireSchoolRole({ headers, roles: ["SCHOOL_ADMIN"] });
  if (context.school.status !== "ACTIVE") throw new Error("School is not operational.");
  return context;
}
