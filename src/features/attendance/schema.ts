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
