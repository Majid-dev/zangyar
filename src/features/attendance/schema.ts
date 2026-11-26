import { z } from "zod";

import { isoDateSchema } from "@/lib/date-schema";

const uuid = z.string().uuid();
const date = isoDateSchema;
const status = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);

/**
 * Attendance is submitted for one timetable slot on one date.
 *
 * The slot identifies the period, the class, the subject, and — through the
 * rotation — the teacher responsible for it, so the caller supplies no classroom,
 * no subject, and no teacher: naming them separately would create a second source
 * of truth for facts the timetable already holds, and a client could then submit
 * a classroom that does not match the period.
 */
export const submitAttendanceSchema = z.object({
  timetableEntryId: uuid,
  businessDate: date,
  records: z.array(z.object({ enrollmentId: uuid, status })).min(1).max(1000),
});

export type SubmitAttendanceInput = z.infer<typeof submitAttendanceSchema>;
