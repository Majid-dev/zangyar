"use server";

import { headers } from "next/headers";

import {
  archiveGrade,
  archiveSubject,
  assignTeacher,
  createAcademicYear,
  createClassroom,
  createGrade,
  createSubject,
  transitionAcademicYear,
  updateSchoolConfiguration,
  updateSchoolStatus,
} from "./services";
import {
  archiveCatalogItemSchema,
  assignTeacherSchema,
  createAcademicYearSchema,
  createClassroomSchema,
  createGradeSchema,
  createSubjectSchema,
  transitionAcademicYearSchema,
  updateSchoolConfigurationSchema,
  updateSchoolStatusSchema,
} from "./schema";
import { formDataToObject, nullableString, optionalNumber } from "./form-data";

export async function updateSchoolConfigurationAction(formData: FormData): Promise<void> {
  const raw = formDataToObject(formData);
  await updateSchoolConfiguration({ headers: await headers(), input: updateSchoolConfigurationSchema.parse({ ...raw, phone: nullableString(formData.get("phone")), address: nullableString(formData.get("address")) }) });
}

export async function updateSchoolStatusAction(formData: FormData): Promise<void> {
  await updateSchoolStatus({ headers: await headers(), input: updateSchoolStatusSchema.parse(formDataToObject(formData)) });
}

export async function createAcademicYearAction(formData: FormData): Promise<void> {
  await createAcademicYear({ headers: await headers(), input: createAcademicYearSchema.parse(formDataToObject(formData)) });
}

export async function transitionAcademicYearAction(formData: FormData): Promise<void> {
  await transitionAcademicYear({ headers: await headers(), input: transitionAcademicYearSchema.parse(formDataToObject(formData)) });
}

export async function createGradeAction(formData: FormData): Promise<void> {
  await createGrade({ headers: await headers(), input: createGradeSchema.parse({ ...formDataToObject(formData), sortOrder: optionalNumber(formData.get("sortOrder")) ?? 0 }) });
}

export async function createSubjectAction(formData: FormData): Promise<void> {
  await createSubject({ headers: await headers(), input: createSubjectSchema.parse(formDataToObject(formData)) });
}

export async function archiveGradeAction(formData: FormData): Promise<void> {
  await archiveGrade({ headers: await headers(), input: archiveCatalogItemSchema.parse(formDataToObject(formData)) });
}

export async function archiveSubjectAction(formData: FormData): Promise<void> {
  await archiveSubject({ headers: await headers(), input: archiveCatalogItemSchema.parse(formDataToObject(formData)) });
}

export async function createClassroomAction(formData: FormData): Promise<void> {
  const raw = formDataToObject(formData);
  await createClassroom({ headers: await headers(), input: createClassroomSchema.parse({ ...raw, capacity: optionalNumber(formData.get("capacity")) ?? null }) });
}

export async function assignTeacherAction(formData: FormData): Promise<void> {
  const raw = formDataToObject(formData);
  await assignTeacher({ headers: await headers(), input: assignTeacherSchema.parse({ ...raw, subjectId: nullableString(formData.get("subjectId")), endDate: nullableString(formData.get("endDate")), isPrimary: formData.get("isPrimary") === "on" }) });
}
