import { z } from "zod";

/**
 * Account settings input.
 *
 * Only the person's own display name is editable here. The mobile number is the
 * login identity (ADR-019) and is deliberately absent: changing it is an identity
 * change with its own authorization rules — a teacher's number is corrected by a
 * School Admin while it is unclaimed, and is the account key afterwards. Role,
 * membership, and account status are likewise not inputs, so a forged form post
 * cannot reach them.
 */
const personName = z
  .string()
  .trim()
  .min(1, "این فیلد الزامی است.")
  .max(100, "این مقدار نمی‌تواند بیشتر از ۱۰۰ نویسه باشد.");

export const updateOwnProfileSchema = z.object({
  firstName: personName,
  lastName: personName,
});

export type UpdateOwnProfileInput = z.input<typeof updateOwnProfileSchema>;

/** A school the signed-in user may switch into. Never trusted from the client. */
export const switchActiveSchoolSchema = z.object({ schoolId: z.string().uuid() });

export type SwitchActiveSchoolInput = z.input<typeof switchActiveSchoolSchema>;
