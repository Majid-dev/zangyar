import { describe, expect, it } from "vitest";

import { AuthorizationError, selectActiveMembership } from "./authorization-core";

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
