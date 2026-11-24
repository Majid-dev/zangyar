import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { platformAdmins, schoolMemberships, schools } from "@/lib/db/schema";

import { readActiveSchoolPreference } from "./active-school";
import {
  AuthorizationError,
  selectActiveMembership,
  selectPreferredMembership,
  type SchoolRole,
} from "./authorization-core";

export { AuthorizationError, selectActiveMembership, selectPreferredMembership } from "./authorization-core";

export type ActiveSchoolMembership = {
  membershipId: string;
  schoolId: string;
  userId: string;
  role: SchoolRole;
  school: typeof schools.$inferSelect;
};

async function requireUser(headers: Headers) {
  const session = await getAuth().api.getSession({ headers });

  if (!session?.user) {
    throw new AuthorizationError("UNAUTHENTICATED", "Authentication is required.");
  }

  return session.user;
}

export async function requireSchoolAccess(options: {
  headers: Headers;
  schoolId?: string;
  roles?: readonly SchoolRole[];
}): Promise<ActiveSchoolMembership> {
  const user = await requireUser(options.headers);
  const rows = await getDb()
    .select({
      membershipId: schoolMemberships.id,
      schoolId: schoolMemberships.schoolId,
      userId: schoolMemberships.userId,
      role: schoolMemberships.role,
      school: schools,
    })
    .from(schoolMemberships)
    .innerJoin(schools, eq(schoolMemberships.schoolId, schools.id))
    .where(
      and(
        eq(schoolMemberships.userId, user.id),
        eq(schoolMemberships.status, "ACTIVE"),
        options.schoolId ? eq(schoolMemberships.schoolId, options.schoolId) : undefined,
      ),
    )
    // A stable order, so the school opened when no selection is stored is the
    // user's first membership rather than whichever row the planner returned.
    .orderBy(asc(schoolMemberships.createdAt), asc(schoolMemberships.id));

  // An explicit `schoolId` is a caller naming one school and is held to the strict
  // rule: no verified membership there means denial. Without one, the persisted
  // selection — itself only ever one of these rows — decides which school opens.
  const membership = options.schoolId
    ? selectActiveMembership(rows, options.schoolId)
    : selectPreferredMembership(rows, readActiveSchoolPreference(options.headers));

  if (options.roles && !options.roles.includes(membership.role)) {
    throw new AuthorizationError("FORBIDDEN", "This school role is not authorized for the operation.");
  }

  const row = rows.find((candidate) => candidate.membershipId === membership.membershipId);
  if (!row) {
    throw new AuthorizationError("SCHOOL_ACCESS_DENIED", "Active school membership not found.");
  }

  return row;
}

export async function requireSchoolRole(options: {
  headers: Headers;
  schoolId?: string;
  roles: readonly SchoolRole[];
}) {
  return requireSchoolAccess(options);
}

export async function requirePlatformAdmin(headers: Headers) {
  const user = await requireUser(headers);
  const [platformAdmin] = await getDb()
    .select({ userId: platformAdmins.userId })
    .from(platformAdmins)
    .where(and(eq(platformAdmins.userId, user.id), isNull(platformAdmins.revokedAt)))
    .limit(1);

  if (!platformAdmin) {
    throw new AuthorizationError("PLATFORM_ACCESS_DENIED", "Platform Admin access is required.");
  }

  return user;
}
