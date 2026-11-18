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
