"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { executeAction } from "@/lib/actions/execute";
import type { ActionResult, ActionState } from "@/lib/actions/result";
import { clearActiveSchoolPreference, writeActiveSchoolPreference } from "@/lib/auth/active-school";
import { formDataToObject } from "@/features/academics/form-data";

import { changeOwnPassword, switchActiveSchool, updateOwnProfile } from "./services";
import { switchActiveSchoolSchema, updateOwnProfileSchema } from "./schema";

type FormAction<T> = (previous: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;

/**
 * The whole shell depends on the active school — navigation, sidebar chrome, and
 * every school-scoped read — so a switch or a rename invalidates the layout
 * rather than only the settings route.
 */
function revalidateAccountSurfaces() {
  revalidatePath("/", "layout");
}

export const updateOwnProfileAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const parsed = updateOwnProfileSchema.parse(formDataToObject(formData));
    const result = await updateOwnProfile({ headers: await headers(), input: parsed });
    revalidateAccountSurfaces();
    return result;
  }, "اطلاعات حساب به‌روزرسانی شد.");

/**
 * Records which of the user's schools should open next.
 *
 * Authorization happens in the service; the preference itself is written here
 * because it is a cookie, and a Server Action is the boundary that can set one.
 * The value only ever narrows which of the user's own memberships opens, so it is
 * a preference rather than a grant — see `lib/auth/active-school`.
 */
export const switchActiveSchoolAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const parsed = switchActiveSchoolSchema.parse(formDataToObject(formData));
    const context = await switchActiveSchool({ headers: await headers(), input: parsed });
    await writeActiveSchoolPreference(context.schoolId);
    revalidateAccountSurfaces();
    return { schoolId: context.schoolId };
  }, "مدرسه‌ی فعال تغییر کرد.");

/**
 * Drops the persisted school selection.
 *
 * Called after sign-out, so a shared browser does not carry one person's school
 * into the next session. It deliberately requires no session: by the time it runs
 * the session is already revoked, and it can only ever remove the caller's own
 * cookie — there is no value to pass and no other user's state to reach.
 */
export async function clearActiveSchoolPreferenceAction(): Promise<void> {
  await clearActiveSchoolPreference();
}

/**
 * The confirmation and the length rule are checked here as well as in the browser,
 * because the client is not a validation boundary. The current password itself is
 * proven by Better Auth, against the stored hash — never by anything sent from
 * here.
 *
 * The "must differ" rule is a `superRefine` rather than a plain `refine` so it
 * only applies to a new password that is otherwise acceptable: a plain refinement
 * would also fire on an empty submission, reporting "must differ from your current
 * password" alongside the required-field errors for a field the user never filled.
 */
const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "گذرواژه‌ی فعلی را وارد کنید.").max(128),
    newPassword: z
      .string()
      .min(8, "گذرواژه‌ی تازه باید حداقل ۸ نویسه باشد.")
      .max(128, "گذرواژه نمی‌تواند بیشتر از ۱۲۸ نویسه باشد."),
    confirmPassword: z.string().min(1, "تکرار گذرواژه را وارد کنید."),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "تکرار گذرواژه با گذرواژه‌ی تازه یکسان نیست.",
  })
  .superRefine((value, ctx) => {
    if (value.newPassword.length < 8) return;
    if (value.newPassword === value.currentPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "گذرواژه‌ی تازه باید با گذرواژه‌ی فعلی متفاوت باشد.",
      });
    }
  });

export const changeOwnPasswordAction: FormAction<unknown> = async (_previous, formData) =>
  executeAction(async () => {
    const parsed = changePasswordFormSchema.parse(formDataToObject(formData));
    await changeOwnPassword({
      headers: await headers(),
      currentPassword: parsed.currentPassword,
      newPassword: parsed.newPassword,
    });
    // Nothing in the shell renders from a password, so no revalidation is needed.
    return { changed: true };
  }, "گذرواژه‌ی حساب تغییر کرد.");
