"use server";

import { headers } from "next/headers";

import { formDataToObject, nullableString } from "@/features/academics/form-data";

import {
  closeEnrollment,
  createEnrollment,
  createGuardian,
  createStudent,
  linkGuardian,
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
  createGuardianSchema,
  createStudentSchema,
  linkGuardianSchema,
  transitionGuardianSchema,
  transitionStudentSchema,
  transferEnrollmentSchema,
  updateGuardianSchema,
  updateStudentGuardianSchema,
  updateStudentSchema,
} from "./schema";

export async function createStudentAction(formData: FormData) {
  await createStudent({ headers: await headers(), input: createStudentSchema.parse({ ...formDataToObject(formData), nationalId: nullableString(formData.get("nationalId")), birthDate: nullableString(formData.get("birthDate")) }) });
}

export async function updateStudentAction(formData: FormData) {
  await updateStudent({ headers: await headers(), input: updateStudentSchema.parse({ ...formDataToObject(formData), nationalId: nullableString(formData.get("nationalId")), birthDate: nullableString(formData.get("birthDate")) }) });
}

export async function transitionStudentAction(formData: FormData) {
  await transitionStudent({ headers: await headers(), input: transitionStudentSchema.parse(formDataToObject(formData)) });
}

export async function createGuardianAction(formData: FormData) {
  await createGuardian({ headers: await headers(), input: createGuardianSchema.parse({ ...formDataToObject(formData), normalizedMobile: nullableString(formData.get("normalizedMobile")) }) });
}

export async function updateGuardianAction(formData: FormData) {
  await updateGuardian({ headers: await headers(), input: updateGuardianSchema.parse({ ...formDataToObject(formData), normalizedMobile: nullableString(formData.get("normalizedMobile")) }) });
}

export async function transitionGuardianAction(formData: FormData) {
  await transitionGuardian({ headers: await headers(), input: transitionGuardianSchema.parse(formDataToObject(formData)) });
}

export async function linkGuardianAction(formData: FormData) {
  await linkGuardian({ headers: await headers(), input: linkGuardianSchema.parse({ ...formDataToObject(formData), isPrimary: formData.get("isPrimary") === "on", receivesSms: formData.get("receivesSms") === "on", isEmergency: formData.get("isEmergency") === "on" }) });
}

export async function updateStudentGuardianAction(formData: FormData) {
  await updateStudentGuardian({ headers: await headers(), input: updateStudentGuardianSchema.parse({ ...formDataToObject(formData), isPrimary: formData.get("isPrimary") === "on", receivesSms: formData.get("receivesSms") === "on", isEmergency: formData.get("isEmergency") === "on" }) });
}

export async function createEnrollmentAction(formData: FormData) {
  await createEnrollment({ headers: await headers(), input: createEnrollmentSchema.parse({ ...formDataToObject(formData), endDate: nullableString(formData.get("endDate")) }) });
}

export async function transferEnrollmentAction(formData: FormData) {
  await transferEnrollment({ headers: await headers(), input: transferEnrollmentSchema.parse({ ...formDataToObject(formData), endDate: nullableString(formData.get("endDate")) }) });
}

export async function closeEnrollmentAction(formData: FormData) {
  await closeEnrollment({ headers: await headers(), input: closeEnrollmentSchema.parse(formDataToObject(formData)) });
}
