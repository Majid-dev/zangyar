"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { executeAction } from "@/lib/actions/execute";
import type { ActionResult, ActionState } from "@/lib/actions/result";
import { formDataToObject } from "@/features/academics/form-data";

import {
  activateTeacher,
  createTeacher,
  resendTeacherInvitation,
  revokeTeacherInvitation,
  setTeacherMembershipStatus,
  updateTeacher,
} from "./services";
import {
  activateTeacherSchema,
  createTeacherSchema,
  resendTeacherInvitationSchema,
  revokeTeacherInvitationSchema,
  teacherTransitionSchema,
  updateTeacherSchema,
} from "./schema";

type FormAction<T> = (previous: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;

function revalidateTeachers(teacherId?: string) {
  revalidatePath("/teachers");
  if (teacherId) revalidatePath(`/teachers/${teacherId}`);
  revalidatePath("/dashboard");
}

/** Also returns the one-time activation link, which is the only delivery surface. */
export const createTeacherAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const result = await createTeacher({
      headers: await headers(),
      input: createTeacherSchema.parse(formDataToObject(formData)),
    });
    revalidateTeachers(result.teacherId);
    return result;
  }, "دبیر به مدرسه اضافه شد. پیوند فعال‌سازی را برای او بفرستید.");

export const updateTeacherAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const result = await updateTeacher({
      headers: await headers(),
      input: updateTeacherSchema.parse(formDataToObject(formData)),
    });
    revalidateTeachers(result.teacherId);
    return result;
  }, "اطلاعات دبیر به‌روزرسانی شد.");

export const setTeacherMembershipStatusAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const parsed = teacherTransitionSchema.parse(formDataToObject(formData));
    const result = await setTeacherMembershipStatus({ headers: await headers(), input: parsed });
    revalidateTeachers(parsed.teacherId);
    return result;
  }, "وضعیت حساب دبیر تغییر کرد.");

export const resendTeacherInvitationAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const parsed = resendTeacherInvitationSchema.parse(formDataToObject(formData));
    const result = await resendTeacherInvitation({ headers: await headers(), input: parsed });
    revalidateTeachers(parsed.teacherId);
    return result;
  }, "دعوت تازه صادر شد. پیوند قبلی دیگر کار نمی‌کند.");

export const revokeTeacherInvitationAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const parsed = revokeTeacherInvitationSchema.parse(formDataToObject(formData));
    const result = await revokeTeacherInvitation({ headers: await headers(), input: parsed });
    revalidateTeachers(parsed.teacherId);
    return result;
  }, "دعوت لغو شد.");

/**
 * Public activation action.
 *
 * Takes no session headers and no tenant identity: the token in the form is the
 * only credential, and the school, user, and role all come from the invitation
 * row it resolves to.
 */
export const activateTeacherAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () =>
    activateTeacher({ input: activateTeacherSchema.parse(formDataToObject(formData)) }),
  "فعال‌سازی حساب انجام شد. اکنون می‌توانید وارد شوید.");
