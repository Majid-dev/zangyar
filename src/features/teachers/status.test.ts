import { describe, expect, it } from "vitest";

import {
  allowedTeacherStatuses,
  canTransitionTeacherStatus,
  deriveTeacherDisplayStatus,
  isRegistered,
  teacherDecisionFor,
  teacherRejectionAction,
  teacherStatusAction,
  type MembershipStatus,
  type TeacherTargetStatus,
} from "./status";

describe("deriveTeacherDisplayStatus", () => {
  it("reports an authorized number as awaiting registration until it is claimed", () => {
    expect(deriveTeacherDisplayStatus({ registrationStatus: "PENDING", membershipStatus: null })).toBe("PENDING_REGISTRATION");
  });

  it("reports a withdrawn authorization as deactivated", () => {
    expect(deriveTeacherDisplayStatus({ registrationStatus: "REVOKED", membershipStatus: null })).toBe("DEACTIVATED");
  });

  it("lets the membership decision win once the person has registered", () => {
    // Approval is the admin's decision, so it is what the list reflects, not the
    // fact that registration happened.
    expect(deriveTeacherDisplayStatus({ registrationStatus: "CLAIMED", membershipStatus: "PENDING_ADMIN_APPROVAL" })).toBe("PENDING_ADMIN_APPROVAL");
    expect(deriveTeacherDisplayStatus({ registrationStatus: "CLAIMED", membershipStatus: "ACTIVE" })).toBe("ACTIVE");
    expect(deriveTeacherDisplayStatus({ registrationStatus: "CLAIMED", membershipStatus: "REJECTED" })).toBe("REJECTED");
  });

  it("collapses suspension and revocation into a single deactivated state", () => {
    expect(deriveTeacherDisplayStatus({ registrationStatus: "CLAIMED", membershipStatus: "SUSPENDED" })).toBe("DEACTIVATED");
    expect(deriveTeacherDisplayStatus({ registrationStatus: "CLAIMED", membershipStatus: "REVOKED" })).toBe("DEACTIVATED");
  });

  it("never reports ACTIVE unless the membership is genuinely active", () => {
    const registrationStatuses = ["PENDING", "CLAIMED", "REVOKED"] as const;
    const membershipStatuses = [null, "ACTIVE", "SUSPENDED", "REVOKED", "PENDING_ADMIN_APPROVAL", "REJECTED"] as const;

    for (const registrationStatus of registrationStatuses) {
      for (const membershipStatus of membershipStatuses) {
        const status = deriveTeacherDisplayStatus({ registrationStatus, membershipStatus });
        if (status === "ACTIVE") expect(membershipStatus).toBe("ACTIVE");
      }
    }
  });
});

describe("isRegistered", () => {
  it("is true only once the number has been claimed", () => {
    expect(isRegistered("PENDING")).toBe(false);
    expect(isRegistered("REVOKED")).toBe(false);
    expect(isRegistered("CLAIMED")).toBe(true);
  });
});

describe("teacher status transitions", () => {
  const ALL: MembershipStatus[] = ["PENDING_ADMIN_APPROVAL", "ACTIVE", "SUSPENDED", "REVOKED", "REJECTED"];
  const TARGETS: TeacherTargetStatus[] = ["ACTIVE", "SUSPENDED", "REJECTED"];

  it("lets a pending registration be approved or rejected", () => {
    expect(canTransitionTeacherStatus("PENDING_ADMIN_APPROVAL", "ACTIVE")).toBe(true);
    expect(canTransitionTeacherStatus("PENDING_ADMIN_APPROVAL", "REJECTED")).toBe(true);
    // Nowhere to suspend from: a pending teacher has no access to take away.
    expect(canTransitionTeacherStatus("PENDING_ADMIN_APPROVAL", "SUSPENDED")).toBe(false);
  });

  it("treats undoing a rejection as the approval transition", () => {
    // There is no separate "reactivate a rejected teacher" path, so a rejection is
    // always recoverable through the same move that approves a pending teacher.
    expect(canTransitionTeacherStatus("REJECTED", "ACTIVE")).toBe(true);
    expect(canTransitionTeacherStatus("REJECTED", "REJECTED")).toBe(false);
    expect(canTransitionTeacherStatus("REJECTED", "SUSPENDED")).toBe(false);
  });

  it("lets an active teacher be deactivated and a suspended one be reactivated", () => {
    expect(allowedTeacherStatuses("ACTIVE")).toEqual(["SUSPENDED"]);
    expect(allowedTeacherStatuses("SUSPENDED")).toEqual(["ACTIVE"]);
    expect(allowedTeacherStatuses("REVOKED")).toEqual(["ACTIVE"]);
  });

  it("never lets a transition end where it started", () => {
    for (const from of ALL) {
      for (const to of TARGETS) {
        if (from === to) expect(canTransitionTeacherStatus(from, to)).toBe(false);
      }
    }
  });

  it("never lets access be ended without the ability to restore it", () => {
    // Every state an access decision can land in leads back to ACTIVE, so no
    // decision is a one-way door: deactivation is reversible and so is rejection.
    const endsAccess = TARGETS.filter((target) => target !== "ACTIVE");
    for (const from of ALL) {
      for (const lost of endsAccess) {
        if (canTransitionTeacherStatus(from, lost)) {
          expect(canTransitionTeacherStatus(lost, "ACTIVE")).toBe(true);
        }
      }
    }
    // And the check is not vacuous: both such states are actually reachable.
    expect(canTransitionTeacherStatus("ACTIVE", "SUSPENDED")).toBe(true);
    expect(canTransitionTeacherStatus("PENDING_ADMIN_APPROVAL", "REJECTED")).toBe(true);
  });

  it("names the decision behind each transition", () => {
    expect(teacherDecisionFor("PENDING_ADMIN_APPROVAL", "ACTIVE")).toBe("APPROVED");
    expect(teacherDecisionFor("REJECTED", "ACTIVE")).toBe("APPROVED");
    expect(teacherDecisionFor("PENDING_ADMIN_APPROVAL", "REJECTED")).toBe("REJECTED");
    expect(teacherDecisionFor("ACTIVE", "SUSPENDED")).toBe("DEACTIVATED");
    expect(teacherDecisionFor("SUSPENDED", "ACTIVE")).toBe("REACTIVATED");
  });
});

describe("teacherStatusAction", () => {
  it("offers nothing before the person registers", () => {
    // There is no access to grant, so the only moves are correcting or deleting the
    // number; a status control would be meaningless.
    expect(teacherStatusAction(null)).toBeNull();
  });

  it("offers approval as the primary action for a pending registration", () => {
    const action = teacherStatusAction("PENDING_ADMIN_APPROVAL");
    expect(action).toMatchObject({ status: "ACTIVE", decision: "APPROVED", tone: "primary" });
    // Approval restores access, so it does not need a confirmation.
    expect(action?.confirmation).toBeNull();
  });

  it("offers activation for both a suspended and a revoked membership", () => {
    expect(teacherStatusAction("SUSPENDED")).toMatchObject({ status: "ACTIVE", decision: "REACTIVATED" });
    expect(teacherStatusAction("REVOKED")).toMatchObject({ status: "ACTIVE", decision: "REACTIVATED" });
  });

  it("asks for confirmation before ending an active teacher's access", () => {
    const action = teacherStatusAction("ACTIVE");
    expect(action).toMatchObject({ status: "SUSPENDED", decision: "DEACTIVATED", tone: "danger" });
    expect(action?.confirmation).toBeTruthy();
  });

  it("offers only moves the transition matrix allows", () => {
    const statuses: MembershipStatus[] = ["PENDING_ADMIN_APPROVAL", "ACTIVE", "SUSPENDED", "REVOKED", "REJECTED"];
    for (const status of statuses) {
      const action = teacherStatusAction(status);
      if (action) expect(canTransitionTeacherStatus(status, action.status)).toBe(true);
    }
  });
});

describe("teacherRejectionAction", () => {
  it("is offered only while a decision is still pending", () => {
    expect(teacherRejectionAction("PENDING_ADMIN_APPROVAL")).toMatchObject({ status: "REJECTED", decision: "REJECTED" });
    // Rejecting an active teacher would be a way to end access without the
    // deactivation wording, so it is not offered at all.
    expect(teacherRejectionAction("ACTIVE")).toBeNull();
    expect(teacherRejectionAction("REJECTED")).toBeNull();
    expect(teacherRejectionAction("SUSPENDED")).toBeNull();
    expect(teacherRejectionAction(null)).toBeNull();
  });
});

describe("mandatory hours in the display status", () => {
  it("reports an active teacher without hours as awaiting hours", () => {
    expect(deriveTeacherDisplayStatus({
      registrationStatus: "CLAIMED",
      membershipStatus: "ACTIVE",
      hoursOutstanding: true,
    })).toBe("AWAITING_HOURS");
  });

  it("reports an active teacher with hours as plain active", () => {
    expect(deriveTeacherDisplayStatus({
      registrationStatus: "CLAIMED",
      membershipStatus: "ACTIVE",
      hoursOutstanding: false,
    })).toBe("ACTIVE");
  });

  it("does not let hours change any state other than active", () => {
    // The flag is a statement about configuration, not access, so it must not be
    // able to make a pending, rejected, or deactivated teacher look different.
    const statuses = ["PENDING_ADMIN_APPROVAL", "REJECTED", "SUSPENDED", "REVOKED"] as const;
    for (const membershipStatus of statuses) {
      expect(deriveTeacherDisplayStatus({ registrationStatus: "CLAIMED", membershipStatus, hoursOutstanding: true }))
        .toBe(deriveTeacherDisplayStatus({ registrationStatus: "CLAIMED", membershipStatus, hoursOutstanding: false }));
    }
  });
});

describe("weekly hours on the status actions", () => {
  it("asks for hours when approving, so approval cannot leave a teacher unconfigured", () => {
    expect(teacherStatusAction("PENDING_ADMIN_APPROVAL")?.requiresWeeklyHours).toBe(true);
    expect(teacherStatusAction("REJECTED")?.requiresWeeklyHours).toBe(true);
  });

  it("does not ask for hours when deactivating or reactivating", () => {
    // A reactivated teacher keeps the figure already on file; re-entering it would
    // invite an accidental change to something the admin did not come here to edit.
    expect(teacherStatusAction("ACTIVE")?.requiresWeeklyHours).toBe(false);
    expect(teacherStatusAction("SUSPENDED")?.requiresWeeklyHours).toBe(false);
    expect(teacherStatusAction("REVOKED")?.requiresWeeklyHours).toBe(false);
  });

  it("never asks for hours on the rejection move", () => {
    expect(teacherRejectionAction("PENDING_ADMIN_APPROVAL")?.requiresWeeklyHours).toBe(false);
  });
});
