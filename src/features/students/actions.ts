"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { executeAction } from "@/lib/actions/execute";
import type { ActionResult } from "@/lib/actions/result";
import { formDataToObject, nullableString } from "@/features/academics/form-data";

import {
  closeEnrollment,
  createAndLinkGuardian,
  createEnrollment,
  createGuardian,
  createStudent,
  linkGuardian,
  registerStudent,
  transitionGuardian,
  transitionStudent,
  transferEnrollment,
  updateGuardian,
  updateStudent,
  updateStudentGuardian,
} from "./services";
import {
  closeEnrollmentSchema,
  createEnrollmentSchema,
  createAndLinkGuardianSchema,
  createGuardianSchema,
  createStudentSchema,
  registerStudentSchema,
  linkGuardianSchema,
  transitionGuardianSchema,
  transitionStudentSchema,
  transferEnrollmentSchema,
  updateGuardianSchema,
  updateStudentGuardianSchema,
  updateStudentSchema,
} from "./schema";

function revalidateStudents(studentId?: string) {
  revalidatePath("/students");
  revalidatePath("/students/new");
  if (studentId) revalidatePath(`/students/${studentId}`);
  revalidatePath("/dashboard");
  revalidatePath("/attendance");
}

export async function createStudentAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await createStudent({ headers: await headers(), input: createStudentSchema.parse({ ...formDataToObject(formData), nationalId: nullableString(formData.get("nationalId")), birthDate: nullableString(formData.get("birthDate")) }) });
    revalidateStudents();
    return result;
  }, "دانش‌آموز با موفقیت ثبت شد.");
}

export async function updateStudentAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const input = updateStudentSchema.parse({ ...formDataToObject(formData), nationalId: nullableString(formData.get("nationalId")), birthDate: nullableString(formData.get("birthDate")) });
    const result = await updateStudent({ headers: await headers(), input });
    revalidateStudents(input.studentId);
    return result;
  }, "اطلاعات دانش‌آموز به‌روزرسانی شد.");
}

export async function transitionStudentAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const input = transitionStudentSchema.parse(formDataToObject(formData));
    const result = await transitionStudent({ headers: await headers(), input });
    revalidateStudents(input.studentId);
    return result;
  }, "وضعیت دانش‌آموز تغییر کرد.");
}

/** One-shot registration used by the guided wizard; all steps land in one transaction. */
export async function registerStudentAction(input: unknown): Promise<ActionResult<{ studentId: string }>> {
  return executeAction(async () => {
    const parsed = registerStudentSchema.parse(input);
    const result = await registerStudent({ headers: await headers(), input: parsed });
    revalidateStudents(result.student.id);
    return { studentId: result.student.id };
  }, "دانش‌آموز با موفقیت ثبت شد.");
}

export async function createGuardianAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await createGuardian({ headers: await headers(), input: createGuardianSchema.parse({ ...formDataToObject(formData), normalizedMobile: nullableString(formData.get("normalizedMobile")), email: nullableString(formData.get("email")) }) });
    revalidateStudents(String(formData.get("studentId") || ""));
    return result;
  }, "ولی با موفقیت ثبت شد.");
}

export async function updateGuardianAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await updateGuardian({ headers: await headers(), input: updateGuardianSchema.parse({ ...formDataToObject(formData), normalizedMobile: nullableString(formData.get("normalizedMobile")) }) });
    revalidateStudents(String(formData.get("studentId") || ""));
    return result;
  }, "اطلاعات ولی به‌روزرسانی شد.");
}

export async function transitionGuardianAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await transitionGuardian({ headers: await headers(), input: transitionGuardianSchema.parse(formDataToObject(formData)) });
    revalidateStudents(String(formData.get("studentId") || ""));
    return result;
  }, "وضعیت ولی تغییر کرد.");
}

export async function linkGuardianAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const flags = { isPrimary: formData.get("isPrimary") === "on", receivesSms: formData.get("receivesSms") === "on", isEmergency: formData.get("isEmergency") === "on" };
    const guardianId = nullableString(formData.get("guardianId"));

    // An empty guardian id means "create then link": the wizard and the profile
    // panel use one action, and matching on normalized mobile avoids duplicating
    // a contact that already exists for a sibling.
    if (!guardianId) {
      const input = createAndLinkGuardianSchema.parse({
        ...formDataToObject(formData),
        guardianId: undefined,
        normalizedMobile: nullableString(formData.get("normalizedMobile")),
        email: nullableString(formData.get("email")),
        ...flags,
      });
      const result = await createAndLinkGuardian({ headers: await headers(), input });
      revalidateStudents(input.studentId);
      return result;
    }

    const input = linkGuardianSchema.parse({ ...formDataToObject(formData), ...flags });
    const result = await linkGuardian({ headers: await headers(), input });
    revalidateStudents(input.studentId);
    return result;
  }, "ولی به پرونده‌ی دانش‌آموز متصل شد.");
}

export async function updateStudentGuardianAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const input = updateStudentGuardianSchema.parse({ ...formDataToObject(formData), isPrimary: formData.get("isPrimary") === "on", receivesSms: formData.get("receivesSms") === "on", isEmergency: formData.get("isEmergency") === "on" });
    const result = await updateStudentGuardian({ headers: await headers(), input });
    revalidateStudents(input.studentId);
    return result;
  }, "ارتباط ولی به‌روزرسانی شد.");
}

export async function createEnrollmentAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const input = createEnrollmentSchema.parse({ ...formDataToObject(formData), endDate: nullableString(formData.get("endDate")) });
    const result = await createEnrollment({ headers: await headers(), input });
    revalidateStudents(input.studentId);
    return result;
  }, "ثبت‌نام دانش‌آموز ایجاد شد.");
}

export async function transferEnrollmentAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const input = transferEnrollmentSchema.parse({ ...formDataToObject(formData), endDate: nullableString(formData.get("endDate")) });
    const result = await transferEnrollment({ headers: await headers(), input });
    revalidateStudents(String(formData.get("studentId") || ""));
    return result;
  }, "انتقال دانش‌آموز انجام شد.");
}

export async function closeEnrollmentAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const input = closeEnrollmentSchema.parse(formDataToObject(formData));
    const result = await closeEnrollment({ headers: await headers(), input });
    revalidateStudents(String(formData.get("studentId") || ""));
    return result;
  }, "ثبت‌نام دانش‌آموز بسته شد.");
}
