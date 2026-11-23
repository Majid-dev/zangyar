"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ActionFeedback, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import type { ActionState } from "@/lib/actions/result";

import { activateTeacherAction, requestActivationCodeAction } from "../actions";

/**
 * Activation form for a teacher following an invitation link.
 *
 * Two steps on one page: prove possession of the mobile by code, then set a
 * password. The token arrives as a hidden field rather than being re-read from the
 * path, so both actions receive it as a normal submitted value.
 *
 * There is no mobile field: the number is resolved from the invitation server-side,
 * so the teacher never has to type it and the browser never learns it. The
 * development code is likewise never rendered here — it is written to the server
 * log.
 */
export function TeacherActivationForm({
  token,
  teacherName,
  schoolName,
  maskedMobile,
}: {
  token: string;
  teacherName: string;
  schoolName: string;
  maskedMobile: string | null;
}) {
  // Step 1 issues the code; the "resend" wording follows whether one has gone out
  // already, derived from the request result rather than separate state.
  const [requestState, requestAction] = useActionState<ActionState<unknown>, FormData>(requestActivationCodeAction, null);
  const [activateState, activateAction] = useActionState<ActionState<unknown>, FormData>(activateTeacherAction, null);
  const codeSent = Boolean(requestState?.ok);

  if (activateState?.ok) {
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
    <div className="mt-8 space-y-6">
      <p className="rounded-xl bg-sage px-3.5 py-3 text-xs leading-6 text-primary">
        {teacherName} عزیز، برای فعال‌سازی حساب خود در {schoolName} ابتدا کد تأیید را دریافت کنید و سپس گذرواژه‌ای انتخاب کنید.
      </p>

      {/* Step 1 — request a code */}
      <form action={requestAction} noValidate>
        <input type="hidden" name="token" value={token} />
        <div className="grid gap-3">
          <p className="text-xs leading-6 text-muted">
            کد تأیید به شماره همراه ثبت‌شده برای شما ارسال می‌شود
            {maskedMobile ? <> (<span dir="ltr">{maskedMobile}</span>)</> : null}.
          </p>
          <div>
            <SubmitButton size="md" pendingLabel="در حال ارسال…">
              {codeSent ? "ارسال دوباره‌ی کد" : "ارسال کد تأیید"}
            </SubmitButton>
          </div>
        </div>
        <ActionFeedback state={requestState} />
      </form>

      {/* Step 2 — code and password. Shown from the start so the page reads as one
          task, but a code must have been requested before it can succeed. */}
      <form action={activateAction} className="grid gap-5 border-t border-border pt-6" noValidate>
        <input type="hidden" name="token" value={token} />

        <Field label="کد تأیید" name="code" hint="رقم‌های ارسال‌شده">
          <Input name="code" inputMode="numeric" dir="ltr" required autoComplete="one-time-code" className="text-start tracking-[0.3em]" />
        </Field>
        <Field label="گذرواژه" name="newPassword" hint="حداقل ۸ نویسه">
          <Input name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label="تکرار گذرواژه" name="confirmPassword">
          <Input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
        </Field>

        <SubmitButton size="lg" pendingLabel="در حال فعال‌سازی…">فعال‌سازی حساب</SubmitButton>
        <ActionFeedback state={activateState} />

        <p className="text-xs leading-6 text-muted">
          این پیوند و کد تأیید هر دو فقط یک‌بار قابل استفاده‌اند. اگر کد منقضی شد، دوباره درخواست کنید؛ اگر پیوند از کار افتاد، از مدیر مدرسه بخواهید دعوت تازه‌ای بفرستد.
        </p>
      </form>
    </div>
  );
}
