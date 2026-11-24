/**
 * Teacher status, and the transition between statuses, as shown to a School Admin.
 *
 * A teacher record is anchored on a `teacher_registrations` row — the mobile
 * number a School Admin authorized. That row exists before any account does, so
 * this module derives one display status from three independent facts: whether
 * the number has been claimed, the membership's approval state, and whether a
 * credential exists.
 *
 * There are deliberately two storage axes and no more:
 *
 *   - `teacher_registrations.status` answers *authorization*: may this number
 *     register? It runs `PENDING → CLAIMED` (or `REVOKED`) and is terminal either
 *     way — it is not a second access flag.
 *   - `school_memberships.status` answers *access*: may this person use the
 *     school? Only `ACTIVE` grants anything, so approval is not a separate
 *     workflow from activation — approving *is* the transition into `ACTIVE`.
 *
 * Because those two questions are genuinely different, they stay two columns.
 * What is unified here is the vocabulary and the rules: one display status, one
 * transition matrix, and one set of actions derived from them, so the detail page
 * and the table can never offer different moves for the same teacher.
 *
 * Mobile verification is reported separately (`users.phoneNumberVerified`) rather
 * than folded in here, because surfaces show it as its own axis.
 */

export type MembershipStatus = "ACTIVE" | "SUSPENDED" | "REVOKED" | "PENDING_ADMIN_APPROVAL" | "REJECTED";
export type RegistrationStatus = "PENDING" | "CLAIMED" | "REVOKED";
export type TeacherDisplayStatus =
  | "PENDING_REGISTRATION"
  | "PENDING_ADMIN_APPROVAL"
  | "ACTIVE"
  | "REJECTED"
  | "DEACTIVATED";

/** The membership statuses a School Admin may move a teacher into. */
export const TEACHER_TARGET_STATUSES = ["ACTIVE", "SUSPENDED", "REJECTED"] as const;
export type TeacherTargetStatus = (typeof TEACHER_TARGET_STATUSES)[number];

export const TEACHER_DISPLAY_STATUS_LABELS: Record<TeacherDisplayStatus, string> = {
  PENDING_REGISTRATION: "در انتظار ثبت‌نام",
  PENDING_ADMIN_APPROVAL: "در انتظار تأیید مدیر",
  ACTIVE: "فعال",
  REJECTED: "رد‌شده",
  DEACTIVATED: "غیرفعال",
};

export const TEACHER_DISPLAY_STATUS_TONES: Record<TeacherDisplayStatus, "success" | "warning" | "danger" | "neutral" | "info"> = {
  PENDING_REGISTRATION: "neutral",
  PENDING_ADMIN_APPROVAL: "info",
  ACTIVE: "success",
  REJECTED: "danger",
  DEACTIVATED: "warning",
};

/**
 * Precedence: a membership decision wins over the registration row, because that
 * is the decision the admin actually made. Only once the person has registered —
 * and so has a membership — can approval, rejection, or deactivation apply;
 * before then the row is simply awaiting registration.
 */
export function deriveTeacherDisplayStatus(input: {
  registrationStatus: RegistrationStatus;
  membershipStatus: MembershipStatus | null;
}): TeacherDisplayStatus {
  if (!input.membershipStatus) {
    // No membership yet. A revoked authorization is reported as deactivated so the
    // admin sees it as withdrawn rather than as still waiting.
    return input.registrationStatus === "REVOKED" ? "DEACTIVATED" : "PENDING_REGISTRATION";
  }

  switch (input.membershipStatus) {
    case "ACTIVE":
      return "ACTIVE";
    case "PENDING_ADMIN_APPROVAL":
      return "PENDING_ADMIN_APPROVAL";
    case "REJECTED":
      return "REJECTED";
    case "SUSPENDED":
    case "REVOKED":
      return "DEACTIVATED";
    default:
      return "PENDING_REGISTRATION";
  }
}

/** Whether the person has registered and so has an account to administer. */
export function isRegistered(registrationStatus: RegistrationStatus) {
  return registrationStatus === "CLAIMED";
}

/**
 * The single transition rule for teacher access.
 *
 * `PENDING_ADMIN_APPROVAL → ACTIVE` is approval, and approval is the only thing
 * that grants access, so it is also activation — there is no separate state a
 * teacher sits in between the two. `REJECTED → ACTIVE` is the same transition, so
 * undoing a rejection is an approval rather than a distinct "reactivate a
 * rejected teacher" path. `ACTIVE → SUSPENDED` is deactivation and returns
 * through `SUSPENDED → ACTIVE`.
 *
 * Expressed as a pure predicate keyed on the *stored* status rather than on the
 * display status, because a display status can be reached by two different rows
 * (a withdrawn authorization and a suspended membership both read as
 * "deactivated") while their legal moves differ.
 */
const TEACHER_STATUS_TRANSITIONS: Record<MembershipStatus, readonly TeacherTargetStatus[]> = {
  PENDING_ADMIN_APPROVAL: ["ACTIVE", "REJECTED"],
  REJECTED: ["ACTIVE"],
  ACTIVE: ["SUSPENDED"],
  SUSPENDED: ["ACTIVE"],
  // A revoked membership is re-admitted the same way a suspended one is; the row
  // is retained either way, matching the archive-over-delete rule.
  REVOKED: ["ACTIVE"],
};

export function canTransitionTeacherStatus(from: MembershipStatus, to: TeacherTargetStatus): boolean {
  return TEACHER_STATUS_TRANSITIONS[from].includes(to);
}

export function allowedTeacherStatuses(from: MembershipStatus): readonly TeacherTargetStatus[] {
  return TEACHER_STATUS_TRANSITIONS[from];
}

/** The decision behind a transition, which is what the audit trail and the copy name. */
export type TeacherDecision = "APPROVED" | "REJECTED" | "DEACTIVATED" | "REACTIVATED";

export function teacherDecisionFor(from: MembershipStatus, to: TeacherTargetStatus): TeacherDecision {
  if (to === "REJECTED") return "REJECTED";
  if (to === "SUSPENDED") return "DEACTIVATED";
  // Into ACTIVE: from a pending or rejected state this is the approval decision.
  return from === "PENDING_ADMIN_APPROVAL" || from === "REJECTED" ? "APPROVED" : "REACTIVATED";
}

/** What the admin is told after a transition, keyed by the decision that happened. */
export const TEACHER_DECISION_MESSAGES: Record<TeacherDecision, string> = {
  APPROVED: "دبیر تأیید و دسترسی او فعال شد.",
  REJECTED: "ثبت‌نام دبیر رد شد. هر زمان بخواهید می‌توانید تأییدش کنید.",
  DEACTIVATED: "دسترسی دبیر غیرفعال شد.",
  REACTIVATED: "دسترسی دبیر دوباره فعال شد.",
};

/**
 * The action a School Admin is offered for a teacher, derived from the stored
 * state so every surface shows the same one.
 *
 * `SUSPENDED` and `REVOKED` both offer activation because both are recoverable;
 * `PENDING_REGISTRATION` offers none, because before the person registers there is
 * no access to grant — the only moves are correcting or withdrawing the number.
 */
export type TeacherStatusAction = {
  /** The membership status this action writes. */
  status: TeacherTargetStatus;
  decision: TeacherDecision;
  /** Button text. */
  label: string;
  /** Question shown before an action whose effects the admin should weigh. */
  confirmation: string | null;
  tone: "primary" | "secondary" | "danger";
};

export function teacherStatusAction(membershipStatus: MembershipStatus | null): TeacherStatusAction | null {
  if (!membershipStatus) return null;

  switch (membershipStatus) {
    case "PENDING_ADMIN_APPROVAL":
      return {
        status: "ACTIVE",
        decision: "APPROVED",
        label: "تأیید دبیر",
        confirmation: null,
        tone: "primary",
      };
    case "REJECTED":
      return {
        status: "ACTIVE",
        decision: "APPROVED",
        label: "تأیید و فعال‌سازی",
        confirmation: null,
        tone: "secondary",
      };
    case "ACTIVE":
      return {
        status: "SUSPENDED",
        decision: "DEACTIVATED",
        label: "غیرفعال‌سازی",
        confirmation: "دسترسی این دبیر قطع شود؟ تا فعال‌سازی دوباره، به منابع مدرسه دسترسی ندارد.",
        tone: "danger",
      };
    case "SUSPENDED":
    case "REVOKED":
      return {
        status: "ACTIVE",
        decision: "REACTIVATED",
        label: "فعال‌سازی",
        confirmation: null,
        tone: "secondary",
      };
    default:
      return null;
  }
}

/**
 * The rejection move, offered wherever approval is.
 *
 * Kept apart from `teacherStatusAction` because a teacher row can carry both
 * decisions at once (approve or reject), and the table shows one primary action
 * while the detail page shows the full pair.
 */
export function teacherRejectionAction(membershipStatus: MembershipStatus | null): TeacherStatusAction | null {
  if (membershipStatus !== "PENDING_ADMIN_APPROVAL") return null;
  return {
    status: "REJECTED",
    decision: "REJECTED",
    label: "رد ثبت‌نام",
    confirmation: "ثبت‌نام این دبیر رد شود؟ دسترسی او فعال نمی‌شود و می‌توانید بعداً تأییدش کنید.",
    tone: "danger",
  };
}
