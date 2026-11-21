import { z } from "zod";

import { isValidIranianMobile, isValidNationalId, normalizeAdmissionNumber, normalizeMobile, normalizeNationalId } from "./normalization";

const uuid = z.string().uuid();

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.").superRefine((value, context) => {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    context.addIssue({ code: "custom", message: "Date does not exist." });
  }
});

const normalizedAdmissionNumber = z.string().trim().min(1).max(64).transform(normalizeAdmissionNumber);
const normalizedNationalId = z.preprocess((value) => normalizeNationalId(typeof value === "string" ? value : null), z.string().regex(/^\d{10}$/, "National ID must contain 10 digits.").nullable());
const normalizedMobile = z.preprocess((value) => normalizeMobile(typeof value === "string" ? value : null), z.string().regex(/^09\d{9}$/, "Mobile must be a valid Iranian mobile number.").nullable());

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
export const updateStudentGuardianSchema = linkGuardianSchema;

export const createEnrollmentSchema = z.object({
  studentId: uuid,
  academicYearId: uuid,
  classroomId: uuid,
  startDate: dateSchema,
  endDate: dateSchema.nullable().optional().default(null),
}).superRefine((value, context) => {
  if (value.endDate && value.startDate >= value.endDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after start date." });
  }
});
export const transferEnrollmentSchema = z.object({
  enrollmentId: uuid,
  classroomId: uuid,
  startDate: dateSchema,
  endDate: dateSchema.nullable().optional().default(null),
}).superRefine((value, context) => {
  if (value.endDate && value.startDate >= value.endDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after start date." });
  }
});
export const closeEnrollmentSchema = z.object({ enrollmentId: uuid, endDate: dateSchema });

export const studentListFilterSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: studentStatusSchema.optional(),
  classroomId: uuid.optional(),
  academicYearId: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const rosterSchema = z.object({ classroomId: uuid, businessDate: dateSchema });

export const normalizedStudentInput = createStudentSchema.transform((value) => ({ ...value, admissionNumber: normalizeAdmissionNumber(value.admissionNumber) }));

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type TransitionStudentInput = z.infer<typeof transitionStudentSchema>;
export type CreateGuardianInput = z.infer<typeof createGuardianSchema>;
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>;
export type TransitionGuardianInput = z.infer<typeof transitionGuardianSchema>;
export type LinkGuardianInput = z.infer<typeof linkGuardianSchema>;
export type UpdateStudentGuardianInput = z.infer<typeof updateStudentGuardianSchema>;
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type TransferEnrollmentInput = z.infer<typeof transferEnrollmentSchema>;
export type CloseEnrollmentInput = z.infer<typeof closeEnrollmentSchema>;
export type StudentListFilter = z.infer<typeof studentListFilterSchema>;
export type RosterInput = z.infer<typeof rosterSchema>;

export function assertNormalizedContactInput(input: { normalizedMobile?: string | null; nationalId?: string | null }) {
  if (!isValidIranianMobile(input.normalizedMobile)) throw new Error("Guardian mobile must be a valid Iranian mobile number.");
  if (!isValidNationalId(input.nationalId)) throw new Error("National ID must contain 10 digits.");
}
