export type SchoolRole = "SCHOOL_ADMIN" | "TEACHER";

export type MembershipCandidate = {
  membershipId: string;
  schoolId: string;
  userId: string;
  role: SchoolRole;
};

export class AuthorizationError extends Error {
  constructor(
    public readonly code:
      | "UNAUTHENTICATED"
      | "SCHOOL_ACCESS_DENIED"
      | "AMBIGUOUS_SCHOOL"
      | "FORBIDDEN"
      | "PLATFORM_ACCESS_DENIED",
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function selectActiveMembership(
  memberships: readonly MembershipCandidate[],
  requestedSchoolId?: string,
): MembershipCandidate {
  const matches = requestedSchoolId
    ? memberships.filter((membership) => membership.schoolId === requestedSchoolId)
    : memberships;

  if (matches.length === 0) {
    throw new AuthorizationError("SCHOOL_ACCESS_DENIED", "Active school membership not found.");
  }

  if (matches.length > 1) {
    throw new AuthorizationError("AMBIGUOUS_SCHOOL", "Active school selection is ambiguous.");
  }

  return matches[0];
}

/**
 * Resolves the school a request should run in when the user belongs to several.
 *
 * The candidates are already the user's *verified, active* memberships, so this
 * function cannot grant access to a school the user does not have — it only
 * decides which of their own schools to open. `preferredSchoolId` is the
 * persisted selection, and it is treated as a hint: a value matching no
 * membership (a stale cookie, or one naming somebody else's school) is discarded
 * and the caller's deterministic order decides instead. That order is the
 * membership's creation order, supplied by the query, so an unselected user
 * always lands in the same school until they choose another.
 *
 * `selectActiveMembership` above stays the strict rule for a caller that names a
 * school explicitly: there, a school without a verified membership is denied
 * rather than quietly replaced by another.
 */
export function selectPreferredMembership(
  memberships: readonly MembershipCandidate[],
  preferredSchoolId?: string | null,
): MembershipCandidate {
  if (memberships.length === 0) {
    throw new AuthorizationError("SCHOOL_ACCESS_DENIED", "Active school membership not found.");
  }

  if (preferredSchoolId) {
    const preferred = memberships.find((membership) => membership.schoolId === preferredSchoolId);
    if (preferred) return preferred;
  }

  return memberships[0];
}
