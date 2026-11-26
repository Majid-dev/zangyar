/**
 * The school week, the rotating-shift calendar, and period arithmetic.
 *
 * Everything here is pure: given a business date and the school's configuration it
 * answers which school weekday that is, which shift is in session, and whether the
 * school operates. Keeping it pure is what lets the same functions decide a shift
 * for a date on an attendance page, in a report, and during a write without any of
 * them consulting a clock or a row.
 *
 * The school week starts on Saturday. `dayOfWeek` follows that: 1 = Saturday
 * through 7 = Friday, which is the same numbering the database check constraints
 * enforce. JavaScript's `Date#getUTCDay` numbers Sunday as 0, so the conversion
 * lives here and nowhere else.
 *
 * There is no longer a "which of the two teachers owns this period" question here.
 * The timetable records each hour of a period as its own assignment, so a period
 * whose hours belong to two people is two rows and each row names one teacher;
 * whoever the row names is the person responsible, on every date, with no rotation
 * left to resolve.
 */

export const SCHOOL_WEEKDAY_LABELS: Record<number, string> = {
  1: "شنبه",
  2: "یک‌شنبه",
  3: "دوشنبه",
  4: "سه‌شنبه",
  5: "چهارشنبه",
  6: "پنج‌شنبه",
  7: "جمعه",
};

/**
 * The weekdays a school is assumed open on before it says otherwise.
 *
 * Saturday through Wednesday, which is the ordinary Iranian school week: Thursday
 * and Friday are the weekend and are left unchecked. This is a starting point for a
 * school that has never saved its operating days, not a value written on its
 * behalf — the form shows it pre-checked so saving is one action rather than seven,
 * and a school that has saved its own week keeps exactly what it saved.
 */
export const DEFAULT_OPERATING_DAYS: readonly number[] = [1, 2, 3, 4, 5];

export const SCHOOL_SHIFT_LABELS: Record<SchoolShiftType, string> = {
  MORNING: "صبح",
  AFTERNOON: "بعدازظهر",
  ROTATING: "چرخشی هفتگی (صبح/بعدازظهر)",
};

export type SchoolShiftType = "MORNING" | "AFTERNOON" | "ROTATING";

/** The shift actually in session on a date. A rotating week is never both. */
export type ApplicableShift = "MORNING" | "AFTERNOON";

export function schoolDayOfWeek(businessDate: string): number {
  const [year, month, day] = businessDate.split("-").map(Number);
  const sundayZeroDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  // Sunday (0) is the second day of the school week, so shift by one and wrap.
  return ((sundayZeroDay + 1) % 7) + 1;
}

/** Days since the epoch for a `YYYY-MM-DD` date, so week arithmetic is integer arithmetic. */
function daysSinceEpoch(businessDate: string): number {
  const [year, month, day] = businessDate.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * The Saturday that opens the school week containing `businessDate`.
 *
 * Alternation is decided per week, not per day, so a split period must resolve to
 * one teacher for the whole week. Snapping to the week start is what makes that
 * true even when two calls arrive on different days of the same week.
 */
export function schoolWeekStart(businessDate: string): string {
  const offset = schoolDayOfWeek(businessDate) - 1;
  const start = daysSinceEpoch(businessDate) - offset;
  return new Date(start * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Whole weeks between two week starts, which is the rotation index.
 *
 * Signed, so a date before the base week yields a negative index; callers that
 * need a parity take the absolute value's parity, because alternating backwards
 * from the anchor still alternates.
 */
export function weeksBetween(fromWeekStart: string, toWeekStart: string): number {
  return Math.round((daysSinceEpoch(toWeekStart) - daysSinceEpoch(fromWeekStart)) / 7);
}

/**
 * Whether the week containing `businessDate` is a morning week.
 *
 * The week containing the school's `rotationBaseDate` is the morning week, and
 * each following week alternates. Parity is taken from the absolute distance so
 * that dates before the anchor alternate in step rather than inverting the
 * pattern.
 */
export function isMorningRotationWeek(baseDate: string, businessDate: string): boolean {
  const index = weeksBetween(schoolWeekStart(baseDate), schoolWeekStart(businessDate));
  return Math.abs(index) % 2 === 0;
}

export type SchoolShiftConfiguration = {
  shiftType: SchoolShiftType;
  rotationBaseDate: string | null;
};
/**
 * Which shift the school is in on a date.
 *
 * A fixed shift answers itself. A rotating one hands the school between morning
 * and afternoon week by week from the configured anchor, and an unanchored
 * rotating configuration falls back to morning rather than throwing: the settings
 * check constraint requires the anchor, so this is only reachable if a row was
 * written before that constraint existed, and a school with a schedule is more
 * useful than an error page.
 */
export function resolveApplicableShift(businessDate: string, configuration: SchoolShiftConfiguration): ApplicableShift {
  if (configuration.shiftType === "MORNING") return "MORNING";
  if (configuration.shiftType === "AFTERNOON") return "AFTERNOON";
  if (!configuration.rotationBaseDate) return "MORNING";
  return isMorningRotationWeek(configuration.rotationBaseDate, businessDate) ? "MORNING" : "AFTERNOON";
}

/** Whether the school operates on the weekday this date falls on. */
export function isSchoolOperatingDay(businessDate: string, operatingDays: readonly number[]): boolean {
  return operatingDays.includes(schoolDayOfWeek(businessDate));
}

/** A period's clock times within one shift. */
export type PeriodTimes = { startTime: string; endTime: string };

/**
 * A period as stored: the opening shift's times, plus the afternoon's when set.
 *
 * The opening pair is required because it is what a fixed school has and what every
 * row is guaranteed to carry; the afternoon pair is optional because only a
 * rotating school states it, and a rotating school that has not yet entered one
 * falls back to the opening times rather than to a schedule nobody wrote.
 */
export type ShiftAwarePeriodTimes = {
  startTime: string;
  endTime: string;
  afternoonStartTime: string | null;
  afternoonEndTime: string | null;
};

/**
 * The times a period runs at, in the shift the school is in on a date.
 *
 * This is what makes a rotating school's two shifts genuinely different schedules:
 * the period a class meets in is the same period either way, but the clock times it
 * runs at are the ones belonging to the shift that date falls in. For a fixed
 * school, and for a rotating school's afternoon weeks before an afternoon schedule
 * has been entered, the opening pair is the answer — the same fallback the shift
 * resolver itself uses, so a school with a configured morning week is never left
 * with an undefined schedule.
 *
 * Pure, so the entry form, the timetable grid, the attendance deadline, and any
 * report all derive a period's times the same way from the same inputs.
 */
export function resolvePeriodTimes(period: ShiftAwarePeriodTimes, applicableShift: ApplicableShift): PeriodTimes {
  if (applicableShift === "AFTERNOON" && period.afternoonStartTime && period.afternoonEndTime) {
    return { startTime: period.afternoonStartTime, endTime: period.afternoonEndTime };
  }
  return { startTime: period.startTime, endTime: period.endTime };
}

/**
 * Week one of an academic year, and every following week, as an index.
 *
 * The rotation is counted from the academic year's own `startDate`, not from a
 * calendar week number and not from the shift's anchor. A school year begins in
 * the middle of a calendar year, so any week numbering that resets in January
 * would flip the parity mid-year and hand a period to the wrong teacher; counting
 * whole weeks forward from the year's first day has no such reset, and passes
 * through leap years, month boundaries, and holidays without a special case —
 * because none of those change how many weeks have elapsed since the start.
 *
 * The anchor is snapped to its school week first, so a year that opens mid-week
 * still rotates on week boundaries: the whole opening week is week zero, and the
 * changeover happens on the Saturday.
 */
export function academicWeekIndex(academicYearStartDate: string, businessDate: string): number {
  return weeksBetween(schoolWeekStart(academicYearStartDate), schoolWeekStart(businessDate));
}

/** How a period's responsibility alternates, and which teacher holds the base week. */
export type AttendanceRotation = { baseTeacherMembershipId: string; partnerTeacherMembershipId: string };

/**
 * Which of a split period's two teachers owes the register in a given week.
 *
 * The teacher who teaches the period's *first* hour holds the week the academic
 * year opens, and the two alternate from there, exactly as the school shifts do.
 * Every week resolves to one of them for the period as a whole, which is what
 * makes "one teacher records the entire period" true even though its two hours
 * are two different lessons: the responsibility is a property of the week, not of
 * whichever hour is being looked at.
 *
 * Returns null when the period is not split, so a caller can ask "who is
 * responsible" of any period and get the teacher it names rather than having to
 * branch on whether the period rotates.
 */
export function resolveAttendanceRotationTeacher(
  rotation: AttendanceRotation | null,
  academicYearStartDate: string,
  businessDate: string,
): string | null {
  if (!rotation) return null;
  // Parity is taken from the absolute distance so a date before the year's first
  // day alternates in step rather than inverting the pattern.
  const isBaseWeek = Math.abs(academicWeekIndex(academicYearStartDate, businessDate)) % 2 === 0;
  return isBaseWeek ? rotation.baseTeacherMembershipId : rotation.partnerTeacherMembershipId;
}

/**
 * How many 1-based weeks after the academic year's opening week a date falls in.
 *
 * Exposed so the interface can say which rotation week a date is in, rather than
 * only who it hands the period to: "week three of the year" is what explains the
 * answer to an admin seeing a teacher they did not expect.
 */
export function academicWeekNumber(academicYearStartDate: string, businessDate: string): number {
  return academicWeekIndex(academicYearStartDate, businessDate) + 1;
}

export type TeacherHourSummary = {
  teacherMembershipId: string;
  assignedWeeklyHours: number;
  requiredWeeklyHours: number | null;
  slotCount: number;
  /** Negative when the teacher is under their obligation, positive when over. */
  difference: number | null;
};

/**
 * Assigned versus required weekly hours for every teacher.
 *
 * One assignment is one hour, so a teacher's assigned hours is the number of
 * assignments that name them — there is no duration to sum and therefore no way
 * for the total to disagree with the rows it counts. `slotCount` is the same
 * figure by construction, and is kept because a report that says "how many hours"
 * and one that says "how many lessons" are different questions even when the
 * answer is the same today.
 *
 * The totals come from the timetable rather than from a stored counter, so the
 * report cannot drift from the schedule it describes: adding an assignment changes
 * the answer immediately, with nothing to keep in step.
 */
export function summarizeTeacherHours(
  slots: readonly { teacherMembershipId: string }[],
  requirements: ReadonlyMap<string, number>,
): TeacherHourSummary[] {
  const totals = new Map<string, number>();
  const membershipIds = new Set<string>([...slots.map((slot) => slot.teacherMembershipId), ...requirements.keys()]);
  for (const membershipId of membershipIds) totals.set(membershipId, 0);
  for (const slot of slots) {
    const total = totals.get(slot.teacherMembershipId);
    if (total === undefined) continue;
    totals.set(slot.teacherMembershipId, total + 1);
  }
  return [...totals.entries()]
    .map(([teacherMembershipId, assignedWeeklyHours]) => {
      const requiredWeeklyHours = requirements.get(teacherMembershipId) ?? null;
      return {
        teacherMembershipId,
        assignedWeeklyHours,
        requiredWeeklyHours,
        slotCount: assignedWeeklyHours,
        difference: requiredWeeklyHours === null ? null : assignedWeeklyHours - requiredWeeklyHours,
      };
    })
    .sort((left, right) => right.assignedWeeklyHours - left.assignedWeeklyHours || left.teacherMembershipId.localeCompare(right.teacherMembershipId));
}
