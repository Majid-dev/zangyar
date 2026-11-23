/**
 * Account status shown to a School Admin.
 *
 * Membership state and invitation state are different things and stay different
 * in storage: a membership is ACTIVE/SUSPENDED/REVOKED and always describes
 * school access, while an invitation describes whether the teacher ever finished
 * activation. This module is the one place they are combined into the single
 * value the teacher list displays, so no caller has to invent its own precedence.
 */

export type MembershipStatus = "ACTIVE" | "SUSPENDED" | "REVOKED";
export type InvitationStatus = "PENDING" | "REVOKED" | "CONSUMED";

export type TeacherInvitationState =
  | { status: InvitationStatus; expiresAt: Date }
  | null
  | undefined;

/** Invitation status as the operator sees it, including derived expiry. */
export type EffectiveInvitationStatus = "PENDING" | "EXPIRED" | "REVOKED" | "CONSUMED" | "NONE";

export type TeacherAccountStatus =
  | "PENDING_ACTIVATION"
  | "ACTIVE"
  | "EXPIRED"
  | "DEACTIVATED"
  | "REVOKED";

export const TEACHER_ACCOUNT_STATUS_LABELS: Record<TeacherAccountStatus, string> = {
  PENDING_ACTIVATION: "در انتظار فعال‌سازی",
  ACTIVE: "فعال",
  EXPIRED: "دعوت منقضی",
  DEACTIVATED: "غیرفعال",
  REVOKED: "لغو‌شده",
};

export const INVITATION_STATUS_LABELS: Record<EffectiveInvitationStatus, string> = {
  PENDING: "در انتظار فعال‌سازی",
  EXPIRED: "منقضی‌شده",
  REVOKED: "لغو‌شده",
  CONSUMED: "استفاده‌شده",
  NONE: "بدون دعوت",
};

export function isInvitationExpired(expiresAt: Date, now: Date) {
  return expiresAt.getTime() <= now.getTime();
}

/** Invitation status including expiry, which is derived rather than stored. */
export function effectiveInvitationStatus(
  invitation: TeacherInvitationState,
  now: Date = new Date(),
): EffectiveInvitationStatus {
  if (!invitation) return "NONE";
  if (invitation.status === "PENDING" && isInvitationExpired(invitation.expiresAt, now)) return "EXPIRED";
  return invitation.status;
}

/**
 * Precedence: membership state wins, because a teacher who cannot access the
 * school is described by that fact regardless of any invitation history.
 * Otherwise the invitation decides whether activation is still outstanding.
 */
export function deriveTeacherAccountStatus(
  membershipStatus: MembershipStatus,
  invitation: TeacherInvitationState,
  now: Date = new Date(),
): TeacherAccountStatus {
  if (membershipStatus === "SUSPENDED") return "DEACTIVATED";
  if (membershipStatus === "REVOKED") return "REVOKED";

  switch (effectiveInvitationStatus(invitation, now)) {
    case "CONSUMED":
      return "ACTIVE";
    case "PENDING":
      return "PENDING_ACTIVATION";
    case "EXPIRED":
      return "EXPIRED";
    default:
      // An active membership with no live invitation and no completed activation
      // cannot be reached through the teacher flow; report it as outstanding
      // rather than as an active account.
      return "PENDING_ACTIVATION";
  }
}
