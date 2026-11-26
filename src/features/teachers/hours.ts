/**
 * Mandatory weekly hours: the gate between approval and scheduling.
 *
 * A teacher's obligation is recorded per academic year in
 * `teacher_weekly_hour_requirements`, and this module is the single place that
 * decides what a recorded value *means*. Two questions are answered here and
 * nowhere else:
 *
 *   - May this teacher be given timetable slots? Only when the year records a
 *     positive figure. A missing or zero figure means the school has not said how
 *     much the teacher owes, so there is nothing to schedule them against — which
 *     is why such a teacher is not merely unreported but ineligible.
 *   - What does a School Admin see? A teacher whose access is active but whose
 *     hours are outstanding is shown as awaiting hours rather than as fully
 *     active, because that is the truth of their situation: they can sign in, and
 *     they cannot be put on a timetable.
 *
 * Kept pure (no database, no clock) so the list, the detail page, the approval
 * dialog, and the timetable service all reach the same verdict from the same
 * inputs, and so the boundaries are unit-testable.
 */

/** The smallest figure that counts as a stated obligation. */
export const MINIMUM_WEEKLY_HOURS = 1;
/** A week has 60 teaching hours at the outside; a larger figure is a typo, not a contract. */
export const MAXIMUM_WEEKLY_HOURS = 60;

/**
 * Whether a recorded figure makes a teacher schedulable.
 *
 * Zero is deliberately not schedulable. A school that genuinely owes nobody any
 * hours should not have the teacher on a timetable at all, and treating zero as
 * "configured" would let a meaningless value open the gate — so zero and missing
 * are the same answer here, which is what the task asks for.
 */
export function isSchedulable(requiredWeeklyHours: number | null | undefined): boolean {
  return typeof requiredWeeklyHours === "number" && Number.isFinite(requiredWeeklyHours) && requiredWeeklyHours > 0;
}

/**
 * The gate's state for one teacher.
 *
 * `NOT_APPLICABLE` is not a failure: a school with no schedulable academic year
 * has nothing to schedule anyone into, so nothing is being withheld and no teacher
 * should be reported as awaiting hours.
 */
export type HourGateVerdict = "NOT_APPLICABLE" | "SATISFIED" | "OUTSTANDING";

export type HourGate = { applicable: false } | { applicable: true; requiredWeeklyHours: number | null };

export function hourGateVerdict(gate: HourGate): HourGateVerdict {
  if (!gate.applicable) return "NOT_APPLICABLE";
  return isSchedulable(gate.requiredWeeklyHours) ? "SATISFIED" : "OUTSTANDING";
}

/**
 * Builds the gate from the raw read, so every caller expresses "is there a year to
 * schedule into" the same way.
 */
export function hourGateFor(academicYearId: string | null, requiredWeeklyHours: number | null): HourGate {
  return academicYearId === null ? { applicable: false } : { applicable: true, requiredWeeklyHours };
}

/**
 * Why a teacher cannot be scheduled, as a sentence for the admin.
 *
 * Shared by the approval refusal and the timetable refusal so the same condition
 * is not explained two different ways depending on where the admin met it.
 */
export const OUTSTANDING_HOURS_MESSAGE = "برای این دبیر ساعت موظفی هفتگی تعیین نشده است؛ تا تعیین آن، امکان تخصیص زنگ وجود ندارد.";

/** Why an approval was refused when the school has no year to record hours against. */
export const NO_ACTIVE_YEAR_MESSAGE = "برای تعیین ساعت موظفی و تأیید دبیر، ابتدا یک سال تحصیلی فعال بسازید.";

/** Why an approval was refused when the dialog arrived without a figure. */
export const MISSING_HOURS_ON_APPROVAL_MESSAGE = "برای تأیید دبیر، ساعت موظفی هفتگی او را تعیین کنید.";
