import { z } from "zod";

import { isoDateSchema } from "@/lib/date-schema";

const uuid = z.string().uuid();
const date = isoDateSchema;
// `HH:MM` or `HH:MM:SS`, which is what a PostgreSQL `time` column accepts and what
// a time input submits.
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "قالب ساعت نامعتبر است.");

/** The most periods a school day can plausibly hold; beyond this it is a typo. */
export const MAXIMUM_PERIODS_PER_DAY = 12;

/**
 * The two hours a period holds.
 *
 * A period is naturally two hours, and the timetable records each hour as its own
 * assignment, so this is the complete set of valid hour indices. It is stated here
 * rather than derived from the database check because the same numbering is what
 * the grid, the assignment form, and the hours report all step through.
 */
export const PERIOD_HOUR_INDICES = [1, 2] as const;
export type PeriodHourIndex = (typeof PERIOD_HOUR_INDICES)[number];

/** What a period's hour is called in the interface. */
export const PERIOD_HOUR_LABELS: Record<PeriodHourIndex, string> = {
  1: "ساعت اول",
  2: "ساعت دوم",
};

/**
 * One hour of one period on one weekday — the unit a timetable assignment names.
 *
 * This is the coordinate the grid selects and the form writes. Carrying the hour
 * as well as the period is what lets a period's two hours be assigned together, or
 * separately to two different teachers with two different subjects.
 */
export const timetableHourCoordinateSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  periodId: uuid,
  hourIndex: z.coerce.number().int().min(1).max(2),
});

export type TimetableHourCoordinate = z.infer<typeof timetableHourCoordinateSchema>;

/**
 * The school's shift configuration: the shape of its day, and — for a rotating
 * school — the date the rotation is measured from.
 *
 * The base date is required exactly when the shift rotates and refused otherwise,
 * mirroring the database check so a half-declared rotation is rejected at the
 * boundary with a sentence instead of surfacing as a constraint violation.
 */
export const schoolShiftSettingsSchema = z.object({
  shiftType: z.enum(["MORNING", "AFTERNOON", "ROTATING"]),
  rotationBaseDate: date.nullable().optional(),
  // The weekdays the school operates on, submitted as `operatingDays` fields.
  operatingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "حداقل یک روز فعالیت انتخاب کنید.").max(7),
}).superRefine((value, context) => {
  if (value.shiftType === "ROTATING") {
    if (!value.rotationBaseDate) {
      context.addIssue({ code: "custom", path: ["rotationBaseDate"], message: "برای شیفت چرخشی، تاریخ مبنا لازم است." });
    }
  } else if (value.rotationBaseDate) {
    context.addIssue({ code: "custom", path: ["rotationBaseDate"], message: "تاریخ مبنا فقط برای شیفت چرخشی مجاز است." });
  }
  if (new Set(value.operatingDays).size !== value.operatingDays.length) {
    context.addIssue({ code: "custom", path: ["operatingDays"], message: "روزهای فعالیت تکراری هستند." });
  }
});

/**
 * One period of the school day.
 *
 * A period has no kind, no label, and no hour count: it is a position in the day
 * described by when it starts and ends. Breaks are not configured at all — the gap
 * between one period's end and the next one's start is the break — which is why
 * this carries only times.
 */
export const upsertPeriodSchema = z.object({
  periodId: uuid.nullable().optional(),
  startTime: time,
  endTime: time,
}).superRefine((value, context) => {
  if (value.startTime >= value.endTime) {
    context.addIssue({ code: "custom", path: ["endTime"], message: "ساعت پایان باید بعد از ساعت شروع باشد." });
  }
});

export const deletePeriodSchema = z.object({ periodId: uuid });

export const setTeacherWeeklyHoursSchema = z.object({
  academicYearId: uuid,
  teacherMembershipId: uuid,
  requiredWeeklyHours: z.coerce.number().int().min(0).max(60),
});

/**
 * Assigning a teacher and a subject to a set of timetable hours.
 *
 * One teacher and one subject per submission, over as many hours as the admin
 * selected: that is the shape of the interaction the grid offers — pick the cells,
 * pick the teacher and the lesson, save — and it makes the common cases fall out
 * of the same request. Selecting one hour is a single-hour assignment; selecting
 * both hours of a period with the same teacher and subject is a full lesson; and
 * running the form twice on one period's two hours, with a different teacher or
 * subject each time, is a split period. Nothing here decides which of those it is,
 * because the rows themselves already say.
 *
 * The hours are de-duplicated by coordinate so a double-click cannot write the same
 * row twice, and expanding a period into its two hours is the caller's job (the
 * grid knows which cells were selected); the service takes the coordinates
 * literally and replaces whatever each one held.
 */
export const assignTimetableHoursSchema = z.object({
  academicYearId: uuid,
  classroomId: uuid,
  subjectId: uuid,
  teacherMembershipId: uuid,
  hours: z.array(timetableHourCoordinateSchema).min(1, "حداقل یک خانه از برنامه را انتخاب کنید.").max(120),
});

/**
 * Clearing a set of timetable hours, so a cell can go back to being free.
 *
 * Addressed by coordinate rather than by entry id because the admin is clearing
 * cells, not rows: at the moment they act they may not know whether a cell holds
 * one assignment or two, and "clear this hour" means the same thing either way.
 */
export const clearTimetableHoursSchema = z.object({
  classroomId: uuid,
  hours: z.array(timetableHourCoordinateSchema).min(1, "حداقل یک خانه از برنامه را انتخاب کنید.").max(120),
});

export type SchoolShiftSettingsInput = z.input<typeof schoolShiftSettingsSchema>;
export type UpsertPeriodInput = z.input<typeof upsertPeriodSchema>;
export type DeletePeriodInput = z.input<typeof deletePeriodSchema>;
export type SetTeacherWeeklyHoursInput = z.input<typeof setTeacherWeeklyHoursSchema>;
export type AssignTimetableHoursInput = z.input<typeof assignTimetableHoursSchema>;
export type ClearTimetableHoursInput = z.input<typeof clearTimetableHoursSchema>;

