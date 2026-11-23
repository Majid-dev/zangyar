import { z } from "zod";

import { toAsciiDigits } from "@/lib/digits";
import { isValidIranianMobile, normalizeIranianMobile } from "@/lib/mobile";

import { effectiveInvitationStatus, type EffectiveInvitationStatus, type MembershipStatus } from "./status";

const uuid = z.string().uuid();

/**
 * The teacher's mobile number is their login identity, so it normalizes through
 * the same canonicalization point as authentication: one stored spelling, one
 * lookup. Accepting localized digits here means a School Admin can paste a number
 * written in Persian digits.
 */
const normalizedMobile = z.preprocess(
  (value) => normalizeIranianMobile(typeof value === "string" ? value : null),
  z
    .string()
    .refine((value) => isValidIranianMobile(value) && /^09\d{9}$/.test(value), "شماره همراه باید یک شماره‌ی همراه معتبر ایران باشد."),
);

const personnelCode = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null),
  z.string().max(50, "کد پرسنلی نمی‌تواند بیشتر از ۵۰ نویسه باشد.").nullable(),
);

const personName = z.string().trim().min(1, "این فیلد الزامی است.").max(100);

/**
 * Note the absence of any role field. A teacher is always provisioned with the
 * TEACHER role, and no input path may change that, so the schema does not offer
 * one to forge in the first place.
 */
export const createTeacherSchema = z.object({
  firstName: personName,
  lastName: personName,
  mobile: normalizedMobile,
  personnelCode: personnelCode.optional().default(null),
});

export const updateTeacherSchema = z.object({
  teacherId: uuid,
  firstName: personName,
  lastName: personName,
  personnelCode: personnelCode.optional().default(null),
});

export const teacherTransitionSchema = z.object({
  teacherId: uuid,
  status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
});

export const resendTeacherInvitationSchema = z.object({ teacherId: uuid });
export const revokeTeacherInvitationSchema = z.object({ teacherId: uuid });

const password = z
  .string()
  .min(8, "گذرواژه باید حداقل ۸ نویسه باشد.")
  .max(128, "گذرواژه نمی‌تواند بیشتر از ۱۲۸ نویسه باشد.");

/** Public activation input. It carries no tenant or user identity by design. */
export const activateTeacherSchema = z
  .object({
    token: z.string().trim().min(1, "پیوند فعال‌سازی معتبر نیست."),
    // The code is normalized through the same digit conversion as every other
    // Persian input, so a code typed with Persian digits is accepted.
    code: z.preprocess(
      (value) => (typeof value === "string" ? toAsciiDigits(value).replace(/\s/g, "") : value),
      z.string().regex(/^\d{4,10}$/, "کد تأیید باید فقط رقم باشد."),
    ),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "تکرار گذرواژه با گذرواژه یکسان نیست.",
  });

export const teacherSortFieldSchema = z.enum(["name", "mobile", "status", "invitation"]);
export const sortDirectionSchema = z.enum(["asc", "desc"]);
export const membershipStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]);
export const invitationStatusFilterSchema = z.enum(["PENDING", "EXPIRED", "REVOKED", "CONSUMED", "NONE"]);

/**
 * URL-derived list filters. Every value is a bounded whitelist or a length-capped
 * string so a hand-edited query string cannot widen a query or reach the
 * database unchanged.
 */
export const teacherListFilterSchema = z.object({
  name: z.string().trim().max(100).optional(),
  mobile: z.string().trim().max(20).optional(),
  membershipStatus: membershipStatusSchema.optional(),
  invitationStatus: invitationStatusFilterSchema.optional(),
  sort: teacherSortFieldSchema.default("name"),
  dir: sortDirectionSchema.default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateTeacherInput = z.input<typeof createTeacherSchema>;
export type UpdateTeacherInput = z.input<typeof updateTeacherSchema>;
export type TeacherTransitionInput = z.infer<typeof teacherTransitionSchema>;
export type ActivateTeacherInput = z.input<typeof activateTeacherSchema>;
export type TeacherListFilter = z.infer<typeof teacherListFilterSchema>;
export type { EffectiveInvitationStatus, MembershipStatus };
export { effectiveInvitationStatus };
