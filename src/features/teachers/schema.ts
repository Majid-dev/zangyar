import { z } from "zod";

import { toAsciiDigits } from "@/lib/digits";
import { isValidIranianMobile, normalizeIranianMobile } from "@/lib/mobile";

import { MAXIMUM_WEEKLY_HOURS, MINIMUM_WEEKLY_HOURS } from "./hours";

const uuid = z.string().uuid();

/**
 * The mobile number is the login identity, so every path that accepts one
 * normalizes through the same canonicalization used by authentication: one stored
 * spelling, one lookup. Localized digits are accepted because an admin may paste a
 * number written in Persian digits.
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
 * A teacher's mandatory weekly teaching hours.
 *
 * Preprocessed from the form's string and accepted in Persian or Latin digits,
 * because an admin typing into a number field on a Persian keyboard produces
 * either. The bounds come from `hours.ts` so the rule has one home and the message
 * the admin reads matches the rule the domain applies.
 */
const weeklyHours = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const normalized = toAsciiDigits(value).replace(/\s/g, "");
    return normalized.length === 0 ? undefined : Number(normalized);
  },
  z
    .number({ message: "ساعت موظفی هفتگی را وارد کنید." })
    .int("ساعت موظفی باید عدد صحیح باشد.")
    .min(MINIMUM_WEEKLY_HOURS, `ساعت موظفی هفتگی باید حداقل ${MINIMUM_WEEKLY_HOURS} ساعت باشد.`)
    .max(MAXIMUM_WEEKLY_HOURS, `ساعت موظفی هفتگی نمی‌تواند بیشتر از ${MAXIMUM_WEEKLY_HOURS} ساعت باشد.`),
);

const password = z
  .string()
  .min(8, "گذرواژه باید حداقل ۸ نویسه باشد.")
  .max(128, "گذرواژه نمی‌تواند بیشتر از ۱۲۸ نویسه باشد.");

/**
 * A School Admin authorizing a mobile number to join the school.
 *
 * Only the number is supplied. The person's name and personnel code are theirs to
 * provide when they register, not the admin's to assert: the admin is entitled to
 * say "this number may join us" and nothing more.
 */
export const registerTeacherMobileSchema = z.object({
  mobile: normalizedMobile,
});

/** Correcting an authorized-but-unclaimed number. */
export const updateRegistrationMobileSchema = z.object({
  registrationId: uuid,
  mobile: normalizedMobile,
});

/** Deleting an authorized-but-unclaimed number outright. */
export const deleteRegistrationSchema = z.object({ registrationId: uuid });

/** Post-registration edits to the details the teacher supplied. */
export const updateTeacherSchema = z.object({
  registrationId: uuid,
  firstName: personName,
  lastName: personName,
  personnelCode: personnelCode.optional().default(null),
});

/**
 * Recording a teacher's mandatory weekly hours.
 *
 * Separate from the status transition even though approval also writes a figure,
 * because editing the obligation later is a manager's routine correction, while
 * approval is an access decision — and only the second one has a membership state
 * to move. Sharing a schema would force every hours edit to carry a status it does
 * not intend to change.
 */
export const setTeacherWeeklyHoursSchema = z.object({
  registrationId: uuid,
  requiredWeeklyHours: weeklyHours,
});

/**
 * The one status transition a School Admin performs on a teacher.
 *
 * Approval, rejection, deactivation, and reactivation are the same operation —
 * "move this teacher's access to that status" — so they share one schema and one
 * service. Which targets are legal from a given status is decided by the
 * transition matrix in `./status`, not here, so the rule has exactly one home.
 *
 * `requiredWeeklyHours` is optional and only read when the target is `ACTIVE`:
 * approval is where the obligation is first recorded, so the field rides along
 * with the transition rather than being a second request. A rejection or
 * deactivation that happens to carry it is ignored, which keeps one round trip
 * possible for the common "approve with hours" case.
 */
export const setTeacherStatusSchema = z.object({
  registrationId: uuid,
  status: z.enum(["ACTIVE", "SUSPENDED", "REJECTED"]),
  requiredWeeklyHours: weeklyHours.optional(),
});

/** Public registration, step 1. Carries no tenant information by design. */
export const requestTeacherRegistrationCodeSchema = z.object({ mobile: normalizedMobile });

/**
 * Public registration, steps 2 and 3.
 *
 * The mobile is repeated only as the lookup key for the OTP challenge; it is never
 * taken as authorization, and the schools involved are resolved server-side from
 * the authorization records. There is no school, membership, or role field, so
 * none can be forged.
 *
 * The personnel code is supplied here rather than by the admin, because it is the
 * teacher's own employment detail at the school. It is optional: a school that
 * does not issue codes must not be blocked from receiving registrations.
 */
export const completeTeacherRegistrationSchema = z
  .object({
    mobile: normalizedMobile,
    code: z.preprocess(
      (value) => (typeof value === "string" ? toAsciiDigits(value).replace(/\s/g, "") : value),
      z.string().regex(/^\d{4,10}$/, "کد تأیید باید فقط رقم باشد."),
    ),
    firstName: personName,
    lastName: personName,
    personnelCode: personnelCode.optional().default(null),
    password,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "تکرار گذرواژه با گذرواژه یکسان نیست.",
  });

export const teacherSortFieldSchema = z.enum(["name", "mobile", "status", "verification", "personnel"]);
export const sortDirectionSchema = z.enum(["asc", "desc"]);
export const teacherDisplayStatusSchema = z.enum([
  "PENDING_REGISTRATION",
  "PENDING_ADMIN_APPROVAL",
  "AWAITING_HOURS",
  "ACTIVE",
  "REJECTED",
  "DEACTIVATED",
]);

/**
 * URL-derived list filters. Every value is a bounded whitelist or a length-capped
 * string so a hand-edited query string cannot widen a query or reach the database
 * unchanged.
 */
export const teacherListFilterSchema = z.object({
  name: z.string().trim().max(100).optional(),
  mobile: z.string().trim().max(20).optional(),
  personnelCode: z.string().trim().max(50).optional(),
  status: teacherDisplayStatusSchema.optional(),
  sort: teacherSortFieldSchema.default("name"),
  dir: sortDirectionSchema.default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type RegisterTeacherMobileInput = z.input<typeof registerTeacherMobileSchema>;
export type UpdateRegistrationMobileInput = z.input<typeof updateRegistrationMobileSchema>;
export type UpdateTeacherInput = z.input<typeof updateTeacherSchema>;
export type SetTeacherStatusInput = z.input<typeof setTeacherStatusSchema>;
export type SetTeacherWeeklyHoursInput = z.input<typeof setTeacherWeeklyHoursSchema>;
export type CompleteTeacherRegistrationInput = z.input<typeof completeTeacherRegistrationSchema>;
export type TeacherListFilter = z.infer<typeof teacherListFilterSchema>;
