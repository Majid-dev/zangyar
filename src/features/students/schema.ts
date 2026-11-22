import { z } from "zod";

import { isoDateSchema } from "@/lib/date-schema";

import { isValidIranianMobile, isValidNationalId, normalizeAdmissionNumber, normalizeMobile, normalizeNationalId } from "./normalization";

const uuid = z.string().uuid();

export const dateSchema = isoDateSchema;

const normalizedAdmissionNumber = z.string().trim().min(1).max(64).transform(normalizeAdmissionNumber);
const normalizedNationalId = z.preprocess((value) => normalizeNationalId(typeof value === "string" ? value : null), z.string().regex(/^\d{10}$/, "کد ملی باید ۱۰ رقم باشد.").nullable());
const normalizedMobile = z.preprocess((value) => normalizeMobile(typeof value === "string" ? value : null), z.string().regex(/^09\d{9}$/, "شماره همراه باید یک شماره‌ی همراه معتبر ایران باشد.").nullable());
const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase() : null),
  z.string().max(320).email("نشانی ایمیل معتبر نیست.").nullable(),
);

export const studentStatusSchema = z.enum(["ACTIVE", "WITHDRAWN", "GRADUATED", "ARCHIVED"]);
export const createStudentSchema = z.object({
  admissionNumber: normalizedAdmissionNumber,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  nationalId: normalizedNationalId.optional().default(null),
  birthDate: dateSchema.nullable().optional().default(null),
});
export const updateStudentSchema = createStudentSchema.partial().extend({ studentId: uuid });
export const transitionStudentSchema = z.object({ studentId: uuid, status: studentStatusSchema });

export const createGuardianSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  normalizedMobile,
  email: optionalEmail.optional(),
});
export const updateGuardianSchema = createGuardianSchema.partial().extend({ guardianId: uuid });
export const transitionGuardianSchema = z.object({ guardianId: uuid, status: z.enum(["ACTIVE", "ARCHIVED"]) });

const relationshipType = z.string().trim().min(1).max(64);
export const linkGuardianSchema = z.object({
  studentId: uuid,
  guardianId: uuid,
  relationshipType,
  isPrimary: z.boolean().default(false),
  receivesSms: z.boolean().default(false),
  isEmergency: z.boolean().default(false),
});

export const createAndLinkGuardianSchema = createGuardianSchema.extend({
  studentId: uuid,
  relationshipType,
  isPrimary: z.boolean().default(false),
  receivesSms: z.boolean().default(false),
  isEmergency: z.boolean().default(false),
});

export const updateStudentGuardianSchema = linkGuardianSchema;

export const createEnrollmentSchema = z.object({
  studentId: uuid,
  academicYearId: uuid,
  classroomId: uuid,
  startDate: dateSchema,
  endDate: dateSchema.nullable().optional().default(null),
}).superRefine((value, context) => {
  if (value.endDate && value.startDate >= value.endDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "تاریخ پایان باید بعد از تاریخ شروع باشد." });
  }
});
export const transferEnrollmentSchema = z.object({
  enrollmentId: uuid,
  classroomId: uuid,
  startDate: dateSchema,
  endDate: dateSchema.nullable().optional().default(null),
}).superRefine((value, context) => {
  if (value.endDate && value.startDate >= value.endDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "تاریخ پایان باید بعد از تاریخ شروع باشد." });
  }
});
export const closeEnrollmentSchema = z.object({ enrollmentId: uuid, endDate: dateSchema });

export const studentListFilterSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: studentStatusSchema.optional(),
  classroomId: uuid.optional(),
  academicYearId: uuid.optional(),
  // Explicit literal mapping: z.coerce.boolean() would read the string "false" as true.
  unenrolled: z.preprocess((value) => value === true || value === "true" || value === "1", z.boolean()).default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const rosterSchema = z.object({ classroomId: uuid, businessDate: dateSchema });

export const normalizedStudentInput = createStudentSchema.transform((value) => ({ ...value, admissionNumber: normalizeAdmissionNumber(value.admissionNumber) }));

/**
 * One-shot registration: profile, optional guardians, and an optional enrollment
 * in a single operation. Guardian rows are matched on normalized mobile within
 * the school so siblings reuse an existing contact record instead of duplicating it.
 */
export const guardianEntrySchema = createGuardianSchema.extend({
  relationshipType,
  isPrimary: z.boolean().default(false),
  receivesSms: z.boolean().default(true),
  isEmergency: z.boolean().default(false),
});

export const registerStudentSchema = z.object({
  student: createStudentSchema,
  guardians: z.array(guardianEntrySchema).max(6).default([]),
  enrollment: z.object({
    academicYearId: uuid,
    classroomId: uuid,
    startDate: dateSchema,
    endDate: dateSchema.nullable().optional().default(null),
  }).nullable().default(null),
}).superRefine((value, context) => {
  const primaries = value.guardians.filter((guardian) => guardian.isPrimary).length;
  if (primaries > 1) {
    context.addIssue({ code: "custom", path: ["guardians"], message: "فقط یک ولی می‌تواند ولی اصلی باشد." });
  }
  // A student who cannot be reached by SMS is not eligible for attendance
  // notification, so require a mobile when SMS delivery is requested.
  value.guardians.forEach((guardian, index) => {
    if (guardian.receivesSms && !guardian.normalizedMobile) {
      context.addIssue({ code: "custom", path: ["guardians", String(index), "normalizedMobile"], message: "برای دریافت پیامک، شماره همراه لازم است." });
    }
  });
  const enrollment = value.enrollment;
  if (enrollment?.endDate && enrollment.startDate >= enrollment.endDate) {
    context.addIssue({ code: "custom", path: ["enrollment", "endDate"], message: "تاریخ پایان باید بعد از تاریخ شروع باشد." });
  }
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type TransitionStudentInput = z.infer<typeof transitionStudentSchema>;
export type CreateGuardianInput = z.infer<typeof createGuardianSchema>;
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>;
export type TransitionGuardianInput = z.infer<typeof transitionGuardianSchema>;
export type LinkGuardianInput = z.infer<typeof linkGuardianSchema>;
export type CreateAndLinkGuardianInput = z.infer<typeof createAndLinkGuardianSchema>;
export type UpdateStudentGuardianInput = z.infer<typeof updateStudentGuardianSchema>;
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type TransferEnrollmentInput = z.infer<typeof transferEnrollmentSchema>;
export type CloseEnrollmentInput = z.infer<typeof closeEnrollmentSchema>;
export type StudentListFilter = z.infer<typeof studentListFilterSchema>;
export type RosterInput = z.infer<typeof rosterSchema>;
export type GuardianEntryInput = z.infer<typeof guardianEntrySchema>;
export type RegisterStudentInput = z.infer<typeof registerStudentSchema>;

export function assertNormalizedContactInput(input: { normalizedMobile?: string | null; nationalId?: string | null }) {
  if (!isValidIranianMobile(input.normalizedMobile)) throw new Error("Guardian mobile must be a valid Iranian mobile number.");
  if (!isValidNationalId(input.nationalId)) throw new Error("National ID must contain 10 digits.");
}
