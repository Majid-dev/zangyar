import { z } from "zod";

import { isoDateSchema } from "@/lib/date-schema";

const uuid = z.string().uuid();
const date = isoDateSchema;
const status = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);

export const submitAttendanceSchema = z.object({
  classroomId: uuid,
  businessDate: date,
  records: z.array(z.object({ enrollmentId: uuid, status })).min(1).max(1000),
});

export type SubmitAttendanceInput = z.infer<typeof submitAttendanceSchema>;
