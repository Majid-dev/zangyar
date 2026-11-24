import { describe, expect, it } from "vitest";

import { AuthorizationError, selectActiveMembership, selectPreferredMembership } from "./authorization-core";

const membership = (schoolId: string, role: "SCHOOL_ADMIN" | "TEACHER" = "TEACHER") => ({
  membershipId: `membership-${schoolId}`,
  schoolId,
  userId: "user-1",
  role,
});

describe("selectActiveMembership", () => {
  it("rejects a school selector for a school without a verified membership", () => {
    expect(() => selectActiveMembership([membership("school-a")], "school-b")).toThrowError(
      new AuthorizationError("SCHOOL_ACCESS_DENIED", "Active school membership not found."),
    );
  });

  it("rejects ambiguous membership context instead of choosing a tenant", () => {
    expect(() => selectActiveMembership([membership("school-a"), membership("school-b")])).toThrowError(
      new AuthorizationError("AMBIGUOUS_SCHOOL", "Active school selection is ambiguous."),
    );
  });

  it("selects only the verified membership matching the requested school", () => {
    expect(selectActiveMembership([membership("school-a"), membership("school-b")], "school-b")).toEqual(
      membership("school-b"),
    );
  });
});

describe("selectPreferredMembership", () => {
  it("opens the preferred school when the user has a membership there", () => {
    expect(
      selectPreferredMembership([membership("school-a"), membership("school-b")], "school-b"),
    ).toEqual(membership("school-b"));
  });

  it("falls back to the first membership when the preference names no membership of theirs", () => {
    // A stale cookie, or one forged to name somebody else's school. It selects
    // from the user's own memberships rather than granting the named school.
    expect(selectPreferredMembership([membership("school-a"), membership("school-b")], "school-elsewhere")).toEqual(
      membership("school-a"),
    );
  });

  it("is deterministic when nothing is stored, so an unselected user always lands in one school", () => {
    const memberships = [membership("school-a"), membership("school-b")];
    expect(selectPreferredMembership(memberships)).toEqual(membership("school-a"));
    expect(selectPreferredMembership(memberships, null)).toEqual(membership("school-a"));
  });

  it("still denies a user with no active membership at all", () => {
    expect(() => selectPreferredMembership([], "school-a")).toThrowError(
      new AuthorizationError("SCHOOL_ACCESS_DENIED", "Active school membership not found."),
    );
  });
});
