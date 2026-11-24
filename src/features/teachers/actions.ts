"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { executeAction } from "@/lib/actions/execute";
import type { ActionResult, ActionState } from "@/lib/actions/result";
import { formDataToObject } from "@/features/academics/form-data";

import {
  TEACHER_DECISION_MESSAGES,
} from "./status";
import {
  completeTeacherRegistration,
  deleteRegistration,
  registerTeacherMobile,
  requestTeacherRegistrationCode,
  setTeacherStatus,
  updateRegistrationMobile,
  updateTeacher,
} from "./services";
import {
  completeTeacherRegistrationSchema,
  deleteRegistrationSchema,
  registerTeacherMobileSchema,
  requestTeacherRegistrationCodeSchema,
  setTeacherStatusSchema,
  updateRegistrationMobileSchema,
  updateTeacherSchema,
} from "./schema";

type FormAction<T> = (previous: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;

function revalidateTeachers(registrationId?: string) {
  revalidatePath("/teachers");
  if (registrationId) revalidatePath(`/teachers/${registrationId}`);
  revalidatePath("/dashboard");
}

// --- School Admin -----------------------------------------------------------------

export const registerTeacherMobileAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const parsed = registerTeacherMobileSchema.parse(formDataToObject(formData));
    const result = await registerTeacherMobile({ headers: await headers(), input: parsed });
    revalidateTeachers(result.registrationId);
    return result;
  }, "شماره همراه ثبت شد. دبیر می‌تواند با آن ثبت‌نام کند.");

export const updateRegistrationMobileAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const parsed = updateRegistrationMobileSchema.parse(formDataToObject(formData));
    const result = await updateRegistrationMobile({ headers: await headers(), input: parsed });
    revalidateTeachers(parsed.registrationId);
    return result;
  }, "شماره همراه ثبت‌نام به‌روزرسانی شد.");

export const deleteRegistrationAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const parsed = deleteRegistrationSchema.parse(formDataToObject(formData));
    const result = await deleteRegistration({ headers: await headers(), input: parsed });
    revalidateTeachers(parsed.registrationId);
    return result;
  }, "شماره همراه ثبت‌شده حذف شد.");

export const updateTeacherAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const result = await updateTeacher({
      headers: await headers(),
      input: updateTeacherSchema.parse(formDataToObject(formData)),
    });
    revalidateTeachers(result.registrationId);
    return result;
  }, "اطلاعات دبیر به‌روزرسانی شد.");

/**
 * The one status action: approve, reject, deactivate, or reactivate.
 *
 * The caller supplies only the target status; which transitions are legal from
 * where the teacher currently stands is decided by the transition matrix in
 * `./status`, server-side, so a stale button cannot talk the server into an
 * illegal move. The success sentence is chosen from the decision the server
 * actually made rather than from the button that was pressed, so a double-submit
 * reports a reactivation instead of claiming another approval.
 */
export const setTeacherStatusAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const parsed = setTeacherStatusSchema.parse(formDataToObject(formData));
    const outcome = await setTeacherStatus({ headers: await headers(), input: parsed });
    revalidateTeachers(parsed.registrationId);
    return outcome;
  }).then((result) => (result.ok ? { ...result, message: TEACHER_DECISION_MESSAGES[result.data.decision] } : result));
// --- Public registration -----------------------------------------------------------

/**
 * Step 1: send a code to an authorized number.
 *
 * Public by design — the person has no session yet. Takes no tenant input, and the
 * response never names a school. `sent: false` means no school authorized the
 * number; the caller shows a generic message either way.
 */
export const requestRegistrationCodeAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const parsed = requestTeacherRegistrationCodeSchema.parse(formDataToObject(formData));
    return requestTeacherRegistrationCode({ input: parsed });
  });

/**
 * Steps 2 and 3: verify the code and complete registration.
 *
 * A mobile that no school authorized is refused here even with a valid code, and
 * the client supplies no school, so a registration cannot be steered at a tenant
 * the person is not authorized for.
 */
export const completeRegistrationAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    return completeTeacherRegistration({ input: completeTeacherRegistrationSchema.parse(formDataToObject(formData)) });
  }, "ثبت‌نام انجام شد. حساب شما در انتظار تأیید مدیر مدرسه است.");
