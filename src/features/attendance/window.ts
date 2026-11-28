import type { SchoolRole } from "@/lib/auth/authorization-core";

/**
 * When a period's register may be written, and what to call the moment.
 *
 * A period is one occurrence of one class on one date, and a teacher reads its
 * status as one of five things: it has not begun yet, it is running, its grace
 * period is running out, its window has closed, or it is already registered.
 * Deriving all five from the period's two instants and the deadline measured from
 * its end is what keeps the page's badges and the server's refusals from disagreeing:
 * the attendance page renders `resolveAttendanceWindow`'s answer and the write checks
 * the same call, so an occurrence drawn as submittable is exactly one the service
 * accepts, and there is no second restatement of the rule to drift from.
 *
 * Pure by construction: it takes the instants it reasons about rather than reading a
 * clock, so a past date, a future one, and a test's fixed instant are all answerable
 * with the same function.
 */

/** How far along an occurrence's lifecycle is, as the interface names it. */
export type AttendanceOccurrenceState = "UPCOMING" | "OPEN" | "GRACE" | "EXPIRED" | "SUBMITTED" | "CLOSED";

export const ATTENDANCE_OCCURRENCE_LABELS: Record<AttendanceOccurrenceState, string> = {
  UPCOMING: "در انتظار شروع",
  OPEN: "قابل ثبت",
  GRACE: "داخل مهلت",
  EXPIRED: "مهلت تمام شده",
  SUBMITTED: "ثبت شده",
  CLOSED: "بسته شده",
};

export type AttendanceWindowInput = {
  now: Date;
  /** When the period begins, in the shift the school is in on this date. */
  periodStartAt: Date;
  periodEndAt: Date;
  /** The period's end plus the school's configured grace period, already applied. */
  submissionDeadlineAt: Date;
  /** Whether a register already exists for this occurrence. */
  hasSession: boolean;
  /** Whether that register has been closed. Nothing closes one yet; the rule is here so the state cannot be silently ignored when something does. */
  sessionClosed: boolean;
  role: SchoolRole;
};

export type AttendanceWindow = {
  state: AttendanceOccurrenceState;
  /** Whether a register may be written — created or corrected — right now. */
  canSubmit: boolean;
  /** True while an unregistered occurrence is inside its grace period. */
  withinGrace: boolean;
  /** Why this role may not write now, in the interface's language; null when they may. */
  blocker: string | null;
};

/**
 * Whether an occurrence's own clock is running right now.
 *
 * This is a narrower question than the state, and it is deliberately asked
 * separately. A register already taken reports `SUBMITTED` for the rest of the day
 * — a teacher looking back wants to see what was recorded, not that the hour has
 * passed — so the state cannot answer "is a class in session at this minute". An
 * administrator's day view wants exactly that: the periods whose bell has rung and
 * whose closing bell has not, whatever has been recorded against them. Comparing the
 * instants is the honest way to get it, and it keeps the answer a function of the
 * shift, the period schedule, and the rotation the instants were resolved from
 * rather than of any hardcoded hour.
 *
 * Inclusive at both ends: the minute a period opens it is in session, and so is the
 * minute it closes. A period of zero length is therefore active on the instant it
 * belongs to, which is the least surprising reading of a malformed schedule.
 */
export function isAttendancePeriodActive(input: { now: Date; periodStartAt: Date; periodEndAt: Date }): boolean {
  const now = input.now.getTime();
  return now >= input.periodStartAt.getTime() && now <= input.periodEndAt.getTime();
}

export const ATTENDANCE_NOT_STARTED_BLOCKER = "این زنگ هنوز آغاز نشده است؛ ثبت حضور از زمان شروع زنگ امکان‌پذیر است.";
export const ATTENDANCE_EXPIRED_BLOCKER = "مهلت ثبت حضور و غیاب این زنگ به پایان رسیده است.";
export const ATTENDANCE_EXPIRED_EDIT_BLOCKER = "مهلت ویرایش حضور و غیاب این زنگ به پایان رسیده است.";
export const ATTENDANCE_CLOSED_BLOCKER = "این جلسه حضور و غیاب بسته شده است و قابل ویرایش نیست.";

export function resolveAttendanceWindow(input: AttendanceWindowInput): AttendanceWindow {
  const now = input.now.getTime();
  const started = now >= input.periodStartAt.getTime();
  const beforeDeadline = now <= input.submissionDeadlineAt.getTime();
  const withinPeriod = now <= input.periodEndAt.getTime();

  // The state answers "what is happening with this occurrence", so an existing
  // register is reported as registered whatever the clock says: a teacher looking
  // back at this morning wants "ثبت شده", not "مهلت تمام شده".
  const state: AttendanceOccurrenceState = input.sessionClosed
    ? "CLOSED"
    : input.hasSession
      ? "SUBMITTED"
      : !started
        ? "UPCOMING"
        : !beforeDeadline
          ? "EXPIRED"
          : withinPeriod
            ? "OPEN"
            : "GRACE";

  // A closed register is final for everyone.
  //
  // A School Admin is otherwise outside the window altogether — exempt from the
  // deadline and from the bell — because correcting a register is their job
  // (ADR-007) and a correction is by definition about a time that has already
  // passed. Exempting them from the start as well is what keeps that promise
  // literally true: "any school date" includes the one the admin is preparing,
  // and there is no register to corrupt on a date that has not happened yet.
  //
  // A teacher is held to both ends: not before the bell, because a register for a
  // period that has not begun is being invented rather than taken, and not after
  // the deadline, because the report the school sends home is worth having only if
  // it is closed by the time it is read.
  //
  // The state is still reported honestly for whoever is asking: an admin looking at
  // tomorrow sees "در انتظار شروع" and an admin looking at last week sees "مهلت
  // تمام شده", while `canSubmit` says whether *they* may act on it.
  const canSubmit = !input.sessionClosed
    && (input.role === "SCHOOL_ADMIN" || (started && beforeDeadline));
  const blocker = canSubmit
    ? null
    : input.sessionClosed
      ? ATTENDANCE_CLOSED_BLOCKER
      : !started
        ? ATTENDANCE_NOT_STARTED_BLOCKER
        : input.hasSession
          ? ATTENDANCE_EXPIRED_EDIT_BLOCKER
          : ATTENDANCE_EXPIRED_BLOCKER;

  return { state, canSubmit, withinGrace: state === "GRACE", blocker };
}
