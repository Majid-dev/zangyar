import { describe, expect, it } from "vitest";

import {
  deriveTeacherAccountStatus,
  effectiveInvitationStatus,
  isInvitationExpired,
  type InvitationStatus,
  type MembershipStatus,
} from "./status";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const FUTURE = new Date("2026-06-02T12:00:00.000Z");
const PAST = new Date("2026-05-31T12:00:00.000Z");

function invitation(status: InvitationStatus, expiresAt: Date) {
  return { status, expiresAt };
}

describe("effectiveInvitationStatus", () => {
  it("derives expiry from time rather than storing it", () => {
    expect(effectiveInvitationStatus(invitation("PENDING", FUTURE), NOW)).toBe("PENDING");
    expect(effectiveInvitationStatus(invitation("PENDING", PAST), NOW)).toBe("EXPIRED");
  });

  it("treats the exact expiry instant as expired", () => {
    expect(isInvitationExpired(NOW, NOW)).toBe(true);
    expect(effectiveInvitationStatus(invitation("PENDING", NOW), NOW)).toBe("EXPIRED");
  });

  it("never re-derives a terminal status", () => {
    expect(effectiveInvitationStatus(invitation("REVOKED", PAST), NOW)).toBe("REVOKED");
    expect(effectiveInvitationStatus(invitation("CONSUMED", PAST), NOW)).toBe("CONSUMED");
  });

  it("reports a missing invitation as NONE", () => {
    expect(effectiveInvitationStatus(null, NOW)).toBe("NONE");
    expect(effectiveInvitationStatus(undefined, NOW)).toBe("NONE");
  });
});

describe("deriveTeacherAccountStatus", () => {
  it("lets membership state win, because it describes school access", () => {
    expect(deriveTeacherAccountStatus("SUSPENDED", invitation("PENDING", FUTURE), NOW)).toBe("DEACTIVATED");
    expect(deriveTeacherAccountStatus("SUSPENDED", invitation("CONSUMED", PAST), NOW)).toBe("DEACTIVATED");
    expect(deriveTeacherAccountStatus("REVOKED", invitation("PENDING", FUTURE), NOW)).toBe("REVOKED");
    expect(deriveTeacherAccountStatus("REVOKED", null, NOW)).toBe("REVOKED");
  });

  it("reads a pending invitation as awaiting activation", () => {
    expect(deriveTeacherAccountStatus("ACTIVE", invitation("PENDING", FUTURE), NOW)).toBe("PENDING_ACTIVATION");
  });

  it("reads a consumed invitation as an active account", () => {
    expect(deriveTeacherAccountStatus("ACTIVE", invitation("CONSUMED", PAST), NOW)).toBe("ACTIVE");
  });

  it("reads a lapsed invitation as expired, not as inactive", () => {
    expect(deriveTeacherAccountStatus("ACTIVE", invitation("PENDING", PAST), NOW)).toBe("EXPIRED");
  });

  it("reads a revoked invitation as still awaiting activation, never as active", () => {
    expect(deriveTeacherAccountStatus("ACTIVE", invitation("REVOKED", PAST), NOW)).toBe("PENDING_ACTIVATION");
  });

  it("covers every membership and invitation combination", () => {
    const memberships: MembershipStatus[] = ["ACTIVE", "SUSPENDED", "REVOKED"];
    const invitations = [null, invitation("PENDING", FUTURE), invitation("PENDING", PAST), invitation("REVOKED", PAST), invitation("CONSUMED", PAST)];

    for (const membershipStatus of memberships) {
      for (const value of invitations) {
        const status = deriveTeacherAccountStatus(membershipStatus, value, NOW);
        // An account may only read as ACTIVE when the membership is active and
        // activation actually completed.
        if (status === "ACTIVE") {
          expect(membershipStatus).toBe("ACTIVE");
          expect(value?.status).toBe("CONSUMED");
        }
      }
    }
  });
});
