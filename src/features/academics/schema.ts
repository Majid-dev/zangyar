import { z } from "zod";

import { isoDateSchema } from "@/lib/date-schema";

const dateSchema = isoDateSchema;
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
    context.addIssue({ code: "custom", path: ["endDate"], message: "تاریخ پایان باید بعد از تاریخ شروع باشد." });
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

/**
 * Changing a class in place.
 *
 * The academic year is deliberately absent: a class belongs to a year, its enrollments
 * are dated against that year, and its timetable rows are keyed to it — moving a class
 * to another year would silently reassign all of that, so a class is created in a year
 * rather than moved between them. What a school does change is the room's name, its
 * code, its capacity, and which grade it belongs to, and all four are here.
 *
 * The grade stays editable because correcting a mis-filed class is an ordinary
 * mistake; it is checked against the school's own grades at the service, so a class
 * cannot be moved onto another school's.
 */
export const updateClassroomSchema = z.object({
  classroomId: z.string().uuid(),
  gradeId: z.string().uuid(),
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120),
  capacity: z.coerce.number().int().positive().max(1000).nullable().optional(),
});

/**
 * What an administrator typed into the search box.
 *
 * One free-text field rather than three: a person looking for a class types "دهم" or
 * "A" or a room's name without first deciding which of those counts as which, and the
 * query matches the term against the name, the code, and the grade's name at once.
 * The grade code is searched as well as its name because the short code is what the
 * school's own paperwork uses.
 */
export const classroomSearchSchema = z.object({
  q: z.string().trim().max(80).optional(),
});

export type UpdateSchoolConfigurationInput = z.infer<typeof updateSchoolConfigurationSchema>;
export type UpdateSchoolStatusInput = z.infer<typeof updateSchoolStatusSchema>;
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;
export type TransitionAcademicYearInput = z.infer<typeof transitionAcademicYearSchema>;
export type CreateGradeInput = z.infer<typeof createGradeSchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type ArchiveCatalogItemInput = z.infer<typeof archiveCatalogItemSchema>;
export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;
export type UpdateClassroomInput = z.infer<typeof updateClassroomSchema>;
export type ClassroomSearchInput = z.infer<typeof classroomSearchSchema>;
