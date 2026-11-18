import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { requireSchoolRole } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { schoolMemberships, users } from "@/lib/db/schema";

export async function listSchoolMemberships(options: { headers: Headers; schoolId?: string }) {
  const context = await requireSchoolRole({
    headers: options.headers,
    schoolId: options.schoolId,
    roles: ["SCHOOL_ADMIN"],
  });

  return getDb()
    .select({
      id: schoolMemberships.id,
      schoolId: schoolMemberships.schoolId,
      userId: schoolMemberships.userId,
      role: schoolMemberships.role,
      status: schoolMemberships.status,
      userName: users.name,
      userEmail: users.email,
    })
    .from(schoolMemberships)
    .innerJoin(users, eq(users.id, schoolMemberships.userId))
    .where(and(eq(schoolMemberships.schoolId, context.schoolId), eq(schoolMemberships.status, "ACTIVE")))
    .orderBy(asc(users.name));
}
