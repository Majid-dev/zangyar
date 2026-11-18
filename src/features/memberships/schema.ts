import { z } from "zod";

export const createMembershipSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["SCHOOL_ADMIN", "TEACHER"]),
});

export const updateMembershipStatusSchema = z.object({
  membershipId: z.string().uuid(),
  status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
});

export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;
export type UpdateMembershipStatusInput = z.infer<typeof updateMembershipStatusSchema>;
