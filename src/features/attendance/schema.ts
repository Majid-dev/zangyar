import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const status = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);

export const submitAttendanceSchema = z.object({
  classroomId: uuid,
  businessDate: date,
  records: z.array(z.object({ enrollmentId: uuid, status })).min(1).max(1000),
});

export type SubmitAttendanceInput = z.infer<typeof submitAttendanceSchema>;
