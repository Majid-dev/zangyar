import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.").superRefine((value, context) => {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    context.addIssue({ code: "custom", message: "Date does not exist." });
  }
});
const timezoneSchema = z.string().min(1).max(64);

export const updateSchoolConfigurationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  timezone: timezoneSchema,
  phone: z.string().trim().max(32).nullable().optional(),
  address: z.string().trim().max(2000).nullable().optional(),
});

export const updateSchoolStatusSchema = z.object({
  schoolId: z.string().uuid(),
  status: z.enum(["ACTIVE", "SUSPENDED", "ARCHIVED"]),
});

export const createAcademicYearSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120),
  startDate: dateSchema,
  endDate: dateSchema,
}).superRefine((value, context) => {
  if (value.startDate >= value.endDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after start date." });
  }
});

export const transitionAcademicYearSchema = z.object({
  academicYearId: z.string().uuid(),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]),
});

export const createGradeSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

export const createSubjectSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120),
});

export const archiveCatalogItemSchema = z.object({
  itemId: z.string().uuid(),
});

export const createClassroomSchema = z.object({
  academicYearId: z.string().uuid(),
  gradeId: z.string().uuid(),
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120),
  capacity: z.coerce.number().int().positive().max(1000).nullable().optional(),
});

export const assignTeacherSchema = z.object({
  classroomId: z.string().uuid(),
  teacherMembershipId: z.string().uuid(),
  subjectId: z.string().uuid().nullable().optional(),
  startDate: dateSchema,
  endDate: dateSchema.nullable().optional(),
  isPrimary: z.preprocess((value) => value === true || value === "on", z.boolean()).default(false),
}).superRefine((value, context) => {
  if (value.endDate && value.startDate >= value.endDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after start date." });
  }
});

export type UpdateSchoolConfigurationInput = z.infer<typeof updateSchoolConfigurationSchema>;
export type UpdateSchoolStatusInput = z.infer<typeof updateSchoolStatusSchema>;
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;
export type TransitionAcademicYearInput = z.infer<typeof transitionAcademicYearSchema>;
export type CreateGradeInput = z.infer<typeof createGradeSchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type ArchiveCatalogItemInput = z.infer<typeof archiveCatalogItemSchema>;
export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;
export type AssignTeacherInput = z.infer<typeof assignTeacherSchema>;
