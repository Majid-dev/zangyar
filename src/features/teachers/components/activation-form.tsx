"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ActionFeedback, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import type { ActionState } from "@/lib/actions/result";

import { activateTeacherAction } from "../actions";

/**
 * Activation form for a teacher following an invitation link.
 *
 * The token arrives as a hidden field rather than being re-read from the path, so
 * the action receives it as a normal submitted value. The visitor supplies only a
 * password: the school, account, and role are all resolved from the token row
 * server-side.
 */
export function TeacherActivationForm({ token, teacherName, schoolName }: { token: string; teacherName: string; schoolName: string }) {
  const [state, formAction] = useActionState<ActionState<unknown>, FormData>(activateTeacherAction, null);

  if (state?.ok) {
    return (
      <div className="mt-8 space-y-5">
        <div className="rounded-2xl border border-success/25 bg-success/8 p-5">
          <p className="text-sm font-black text-success">حساب شما فعال شد.</p>
          <p className="mt-2 text-sm leading-7 text-muted">
            از این پس با شماره همراه خود و گذرواژه‌ای که تعیین کردید وارد زنگ‌یار شوید.
          </p>
        </div>
        <Link href="/login" className="inline-flex min-h-12 items-center rounded-xl bg-primary px-5 text-sm font-bold text-white hover:bg-primary/90">
          ورود به زنگ‌یار
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8 grid gap-5" noValidate>
      <input type="hidden" name="token" value={token} />

      <p className="rounded-xl bg-sage px-3.5 py-3 text-xs leading-6 text-primary">
        {teacherName} عزیز، برای فعال‌سازی حساب خود در {schoolName} گذرواژه‌ای انتخاب کنید. پس از این مرحله با شماره همراه خود وارد می‌شوید.
      </p>

      <Field label="گذرواژه" name="newPassword" hint="حداقل ۸ نویسه">
        <Input name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="تکرار گذرواژه" name="confirmPassword">
        <Input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
      </Field>

      <SubmitButton size="lg" pendingLabel="در حال فعال‌سازی…">فعال‌سازی حساب</SubmitButton>
      <ActionFeedback state={state} />

      <p className="text-xs leading-6 text-muted">
        این پیوند فقط یک‌بار قابل استفاده است. اگر منقضی شده باشد، از مدیر مدرسه بخواهید دعوت تازه‌ای بفرستد.
      </p>
    </form>
  );
}
