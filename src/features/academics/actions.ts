"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { executeAction } from "@/lib/actions/execute";
import type { ActionResult } from "@/lib/actions/result";

import { formDataToObject, nullableString, optionalNumber } from "./form-data";
import {
  archiveCatalogItemSchema,
  createAcademicYearSchema,
  createClassroomSchema,
  createGradeSchema,
  createSubjectSchema,
  transitionAcademicYearSchema,
  updateClassroomSchema,
  updateSchoolConfigurationSchema,
  updateSchoolStatusSchema,
} from "./schema";
import {
  archiveClassroom,
  archiveGrade,
  archiveSubject,
  createAcademicYear,
  createClassroom,
  createGrade,
  createSubject,
  transitionAcademicYear,
  updateClassroom,
  updateSchoolConfiguration,
  updateSchoolStatus,
} from "./services";

const ACADEMICS_PATHS = ["/academics", "/academics/years", "/academics/catalog", "/academics/classrooms", "/dashboard"] as const;

function revalidateAcademics() {
  for (const path of ACADEMICS_PATHS) revalidatePath(path);
}

export async function updateSchoolConfigurationAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(
    async () => {
      const raw = formDataToObject(formData);
      const result = await updateSchoolConfiguration({
        headers: await headers(),
        input: updateSchoolConfigurationSchema.parse({ ...raw, phone: nullableString(formData.get("phone")), address: nullableString(formData.get("address")) }),
      });
      revalidatePath("/academics/school");
      revalidatePath("/dashboard");
      return result;
    },
    "تنظیمات مدرسه ذخیره شد.",
  );
}

export async function updateSchoolStatusAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await updateSchoolStatus({ headers: await headers(), input: updateSchoolStatusSchema.parse(formDataToObject(formData)) });
    revalidateAcademics();
    return result;
  }, "وضعیت مدرسه به‌روزرسانی شد.");
}

export async function createAcademicYearAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await createAcademicYear({ headers: await headers(), input: createAcademicYearSchema.parse(formDataToObject(formData)) });
    revalidateAcademics();
    return result;
  }, "سال تحصیلی ایجاد شد.");
}

export async function transitionAcademicYearAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await transitionAcademicYear({ headers: await headers(), input: transitionAcademicYearSchema.parse(formDataToObject(formData)) });
    revalidateAcademics();
    return result;
  }, "وضعیت سال تحصیلی تغییر کرد.");
}

export async function createGradeAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await createGrade({ headers: await headers(), input: createGradeSchema.parse({ ...formDataToObject(formData), sortOrder: optionalNumber(formData.get("sortOrder")) ?? 0 }) });
    revalidateAcademics();
    return result;
  }, "پایه اضافه شد.");
}

export async function createSubjectAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await createSubject({ headers: await headers(), input: createSubjectSchema.parse(formDataToObject(formData)) });
    revalidateAcademics();
    return result;
  }, "درس اضافه شد.");
}

export async function archiveGradeAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await archiveGrade({ headers: await headers(), input: archiveCatalogItemSchema.parse(formDataToObject(formData)) });
    revalidateAcademics();
    return result;
  }, "پایه بایگانی شد.");
}

export async function archiveSubjectAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await archiveSubject({ headers: await headers(), input: archiveCatalogItemSchema.parse(formDataToObject(formData)) });
    revalidateAcademics();
    return result;
  }, "درس بایگانی شد.");
}

export async function createClassroomAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const raw = formDataToObject(formData);
    const result = await createClassroom({ headers: await headers(), input: createClassroomSchema.parse({ ...raw, capacity: optionalNumber(formData.get("capacity")) ?? null }) });
    revalidateAcademics();
    return result;
  }, "کلاس ایجاد شد.");
}

export async function updateClassroomAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const raw = formDataToObject(formData);
    const result = await updateClassroom({ headers: await headers(), input: updateClassroomSchema.parse({ ...raw, capacity: optionalNumber(formData.get("capacity")) ?? null }) });
    revalidateAcademics();
    // Attendance is not revalidated: a class's name, code, or grade is not what a
    // register is keyed on, so the pages that show a class in a list are the ones that
    // need to be rebuilt, and nothing else changed shape.
    return result;
  }, "کلاس ویرایش شد.");
}

export async function archiveClassroomAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await archiveClassroom({ headers: await headers(), input: archiveCatalogItemSchema.parse(formDataToObject(formData)) });
    revalidateAcademics();
    return result;
  }, "کلاس بایگانی شد.");
}
