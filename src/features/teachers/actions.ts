"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { executeAction } from "@/lib/actions/execute";
import { actionFailure, type ActionResult, type ActionState } from "@/lib/actions/result";
import { formDataToObject } from "@/features/academics/form-data";
import { requestOtp } from "@/features/otp/service";

import {
  activateTeacher,
  createTeacher,
  resendTeacherInvitation,
  revokeTeacherInvitation,
  setTeacherMembershipStatus,
  updateTeacher,
  updateTeacherMobile,
} from "./services";
import { resolveActivationOtpTarget } from "./queries";
import {
  activateTeacherSchema,
  createTeacherSchema,
  resendTeacherInvitationSchema,
  revokeTeacherInvitationSchema,
  teacherTransitionSchema,
  updateTeacherMobileSchema,
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

export const updateTeacherMobileAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const parsed = updateTeacherMobileSchema.parse(formDataToObject(formData));
    const result = await updateTeacherMobile({ headers: await headers(), input: parsed });
    revalidateTeachers(parsed.teacherId);
    return result;
  }, "شماره همراه دبیر تغییر کرد و دعوت تازه‌ای صادر شد.");

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
 * Issues an activation code for the mobile an invitation link belongs to.
 *
 * Public by design: the teacher has no session yet, and the invitation token is
 * the only credential. The mobile is resolved from the token server-side, so the
 * caller never supplies — or learns — the number. The response is deliberately
 * uniform whether or not a code was actually sent, so this cannot be used to probe
 * which numbers exist.
 */
export const requestActivationCodeAction: FormAction<unknown> = async (_previous, formData) => {
  const token = String(formData.get("token") ?? "");
  if (!token) return actionFailure("validation", "پیوند فعال‌سازی معتبر نیست.");
  return executeAction(async () => {
    const target = await resolveActivationOtpTarget(token);
    // An unusable link is reported as such rather than as a delivery problem.
    if (!target) throw new Error("This activation link is invalid or has expired.");

    await requestOtp({
      purpose: "TEACHER_ACTIVATION",
      mobile: target.mobile,
      schoolId: target.schoolId,
      membershipId: target.membershipId,
      context: { schoolName: target.schoolName },
    });

    // Never returns the code: in development it is written to the server log.
    return { sent: true };
  }, "کد تأیید ارسال شد.");
};

export const activateTeacherAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () =>
    activateTeacher({ input: activateTeacherSchema.parse(formDataToObject(formData)) }),
  "فعال‌سازی حساب انجام شد. اکنون می‌توانید وارد شوید.");
