import { z } from "zod";

import { isoDateSchema } from "@/lib/date-schema";

const uuid = z.string().uuid();
const date = isoDateSchema;
const status = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);

/**
 * Attendance is submitted for one classroom's period on one date.
 *
 * The period identifies the class, the day, and — for a split period — which of its
 * two teachers the week hands it to, so the caller supplies no teacher and no
 * subject: naming them separately would create a second source of truth for facts
 * the timetable and the academic year already hold, and a client could then submit
 * a teacher who is not this week's.
 *
 * The classroom is named alongside the period because a period id is only unique
 * within its own list: two classes share no period rows, but the pair is what the
 * grid rows and the register are keyed on, and passing one without the other would
 * make the target ambiguous.
 */
export const submitAttendanceSchema = z.object({
  classroomId: uuid,
  periodId: uuid,
  businessDate: date,
  records: z.array(z.object({ enrollmentId: uuid, status })).min(1).max(1000),
});

export type SubmitAttendanceInput = z.infer<typeof submitAttendanceSchema>;

/**
 * What an administrator's own register cared about, which is not a student's status.
 *
 * `status` here is the *occurrence's* standing — whether the register has been taken
 * — rather than one of the four attendance statuses a student can hold. The two share
 * a word in the interface and nothing else, and naming the field `submissionStatus`
 * keeps a filter on "not yet taken" from being confused with a filter on "absent",
 * which is a different question about a different subject.
 */
export const attendanceSubmissionStatusSchema = z.enum([
  /** Scheduled, not yet registered, and still possible. */
  "PENDING",
  /** A register exists. */
  "SUBMITTED",
  /** Scheduled, still unregistered, and past its deadline. */
  "MISSING",
  /** Not yet begun. */
  "UPCOMING",
]);

export type AttendanceSubmissionStatus = z.infer<typeof attendanceSubmissionStatusSchema>;

/**
 * The administrator's view of attendance: which occurrences to list.
 *
 * Every field is optional and they combine by intersection, so the filters narrow
 * one another rather than replacing one another — a class *and* a period *and* a
 * status is a valid question, and so is any one of them alone. `businessDate` is a
 * single day rather than a range because a scheduled occurrence is only meaningful
 * once its date has been resolved against the school's shift and the week's
 * rotation: a range would be every date in it resolved in turn, which is a loop of
 * queries for a screen that can show one day's register at a time. The date picker
 * is the one the rest of the product already uses, so the convention is kept.
 *
 * `classroomId` and `periodId` are read as a pair when both are given, which is what
 * makes "period three of this class" expressible; a period id alone narrows across
 * every class that meets at that period, which is a legitimate question too.
 *
 * `gradeId` is a scope rather than a narrowing: an administrator always has exactly
 * one grade selected, because a school's day is browsed a grade at a time. It is not
 * expressed as "all grades" with an empty value, so the absence of the field means
 * the server should choose the first grade with classes rather than widen the view.
 *
 * `openSlotKey` is deliberately *not* a filter. It names which occurrence's register
 * is on screen — `classroomId:periodId` — and it is kept apart from the filters above
 * because the two are different acts: opening a card is asking to look at one
 * register, and it must not silently rewrite the list the administrator is browsing.
 */
export const attendanceFilterSchema = z.object({
  businessDate: date.optional(),
  gradeId: uuid.optional(),
  classroomId: uuid.optional(),
  periodId: uuid.optional(),
  submissionStatus: attendanceSubmissionStatusSchema.optional(),
  openSlotKey: z.string().max(80).optional(),
});

export type AttendanceFilter = z.infer<typeof attendanceFilterSchema>;
