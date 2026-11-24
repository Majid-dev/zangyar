"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { ActionFeedback, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { normalizeIranianMobile } from "@/lib/mobile";
import type { ActionState } from "@/lib/actions/result";

import { completeRegistrationAction, requestRegistrationCodeAction } from "../actions";

/**
 * Public teacher registration.
 *
 * Three steps on one page: give the mobile number, prove it with a code, then
 * supply a name and password. The number must already have been authorized by a
 * School Admin — that is the whole eligibility rule, and it is enforced
 * server-side.
 *
 * The number is typed here rather than carried in a link, because no school needs
 * to send anything: the admin's registration of the number is the invitation.
 */
export function TeacherRegistrationForm() {
  const [requestState, requestAction] = useActionState<ActionState<unknown>, FormData>(requestRegistrationCodeAction, null);
  const [completeState, completeAction] = useActionState<ActionState<unknown>, FormData>(completeRegistrationAction, null);

  // The number a code was sent to. Held here so the later steps submit the same
  // value; the server re-validates and re-normalizes it regardless.
  const [mobile, setMobile] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const codeSent = Boolean(requestState?.ok);
  // An unauthorized number is reported explicitly; the message names no school.
  const notAuthorized = Boolean(requestState && !requestState.ok);

  if (completeState?.ok) {
    return (
      <div className="mt-8 space-y-5">
        <div className="rounded-2xl border border-success/25 bg-success/8 p-5">
          <p className="text-sm font-black text-success">ثبت‌نام شما انجام شد.</p>
          <p className="mt-2 text-sm leading-7 text-muted">
            مشخصات شما ثبت شد، اما دسترسی به منابع مدرسه پس از <span className="font-bold text-primary">تأیید مدیر مدرسه</span> فعال می‌شود.
            تا آن زمان می‌توانید وارد سامانه شوید، ولی به بخش‌های مدرسه دسترسی نخواهید داشت.
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
      {/* Step 1 — the mobile number */}
      <form
        action={requestAction}
        noValidate
        onSubmit={(event) => {
          // Guard the format locally for a faster round trip; the server validates
          // independently and the action still receives the raw field value.
          const normalized = normalizeIranianMobile(mobile);
          if (!normalized || !/^09\d{9}$/.test(normalized)) {
            event.preventDefault();
            setClientError("شماره همراه باید با ۰۹ شروع شود و ۱۱ رقم باشد.");
            return;
          }
          setClientError(null);
          setMobile(normalized);
        }}
      >
        <div className="grid gap-3">
          <label htmlFor="register-mobile" className="text-sm font-bold text-primary">شماره همراه</label>
          <Input
            id="register-mobile"
            name="mobile"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            required
            value={mobile}
            onChange={(event) => setMobile(event.target.value)}
            placeholder="09120000000"
            className="min-h-12 text-base tracking-[0.06em] text-start"
          />
          {clientError ? <p role="alert" className="text-xs font-bold text-danger">{clientError}</p> : null}
          <div>
            <SubmitButton size="md" pendingLabel="در حال بررسی…">
              {codeSent ? "ارسال دوباره‌ی کد" : "دریافت کد تأیید"}
            </SubmitButton>
          </div>
        </div>
      </form>

      {/* A number no school authorized. Deliberately names no school. */}
      {notAuthorized ? (
        <p role="alert" className="rounded-xl border border-danger/25 bg-danger/8 px-3.5 py-3 text-sm font-bold leading-6 text-danger">
          این شماره همراه برای ثبت‌نام دبیر در هیچ مدرسه‌ای مجاز نشده است. برای عضویت، از مدیر مدرسه بخواهید شماره‌ی شما را ثبت کند.
        </p>
      ) : null}

      {/* Steps 2 and 3 — code, then identity and password. Shown once a code has
          gone out, so a code cannot be submitted for a number never checked. */}
      {codeSent ? (
        <form action={completeAction} className="grid gap-5 border-t border-border pt-6" noValidate>
          <input type="hidden" name="mobile" value={mobile} />

          <p className="rounded-xl bg-sage px-3.5 py-3 text-xs leading-6 text-primary">
            کد تأیید به شماره <span dir="ltr">{mobile}</span> ارسال شد. آن را وارد کنید و مشخصات خود را تکمیل کنید.
          </p>

          <Field label="کد تأیید" name="code" hint="رقم‌های ارسال‌شده">
            <Input name="code" inputMode="numeric" dir="ltr" required autoComplete="one-time-code" className="text-start tracking-[0.3em]" />
          </Field>
          <Field label="نام" name="firstName"><Input name="firstName" required autoComplete="given-name" /></Field>
          <Field label="نام خانوادگی" name="lastName"><Input name="lastName" required autoComplete="family-name" /></Field>
          <Field label="کد پرسنلی" name="personnelCode" hint="اختیاری">
            <Input name="personnelCode" dir="ltr" className="text-start" autoComplete="off" />
          </Field>
          <Field label="گذرواژه" name="password" hint="حداقل ۸ نویسه">
            <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <Field label="تکرار گذرواژه" name="confirmPassword">
            <Input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
          </Field>

          <SubmitButton size="lg" pendingLabel="در حال ثبت‌نام…">تکمیل ثبت‌نام</SubmitButton>
          <ActionFeedback state={completeState} />

          <p className="text-xs leading-6 text-muted">
            نام و کد پرسنلی خود را خودتان وارد می‌کنید؛ مدیر مدرسه فقط شماره همراه را مجاز کرده است. شماره همراه پس از تأیید کد قابل تغییر نیست، چون نام کاربری شماست. دسترسی شما پس از تأیید مدیر مدرسه فعال می‌شود.
          </p>
        </form>
      ) : null}

      <ActionFeedback state={requestState} />

      <p className="text-xs leading-6 text-muted">
        قبلاً ثبت‌نام کرده‌اید؟ <Link href="/login" className="font-bold text-secondary hover:text-primary">ورود به حساب</Link>
      </p>
    </div>
  );
}
