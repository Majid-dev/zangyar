"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { ActionFeedback, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { formatPersianDateShort } from "@/lib/date";
import type { ActionState } from "@/lib/actions/result";

import { createTeacherAction } from "../actions";

type IssuedInvitation = { id: string; token: string; expiresAt: string; url: string };

type CreateOutcome = {
  teacherId: string;
  membershipId: string;
  invitation: IssuedInvitation;
  existingAccount: boolean;
  reactivated: boolean;
};

/**
 * Add-teacher form.
 *
 * Only a first name, last name, and mobile number are required. The account is
 * created without a password: the teacher sets their own from the activation
 * link, which this form hands to the admin once and only once. There is no role
 * control to fill in, because a teacher is always provisioned as a teacher.
 */
export function TeacherCreateForm() {
  const [state, formAction] = useActionState<ActionState<unknown>, FormData>(createTeacherAction, null);

  // The one-time link is only ever in the successful result; it is not stored on
  // the teacher row in plaintext and cannot be re-read later.
  const created = state?.ok ? (state.data as CreateOutcome | null) : null;

  if (created?.invitation) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-success/25 bg-success/8 p-5">
          <p className="text-sm font-black text-success">دبیر اضافه شد.</p>
          <p className="mt-2 text-sm leading-7 text-muted">
            حساب ساخته شد، اما دبیر تا زمانی که از طریق پیوند زیر گذرواژه‌ی خودش را تعیین نکند نمی‌تواند وارد سامانه شود.
          </p>
          {created.existingAccount ? (
            <p className="mt-3 text-xs leading-6 text-muted">
              این شماره همراه از قبل در زنگ‌یار حساب داشت؛ همان حساب به مدرسه‌ی شما اضافه شد و حساب تازه‌ای ساخته نشد.
            </p>
          ) : null}
          {created.reactivated ? (
            <p className="mt-3 text-xs leading-6 text-muted">عضویت پیشین این دبیر در مدرسه بازفعال شد و دعوت تازه صادر شد.</p>
          ) : null}
        </div>

        <ActivationLink url={created.invitation.url} expiresAt={created.invitation.expiresAt} />

        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/teachers/${created.teacherId}`} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90">
            مشاهده‌ی پرونده‌ی دبیر
          </Link>
          <Link href="/teachers" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-bold text-primary hover:border-secondary/40 hover:text-secondary">
            بازگشت به فهرست دبیران
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="نام" name="firstName"><Input name="firstName" required autoComplete="off" /></Field>
      <Field label="نام خانوادگی" name="lastName"><Input name="lastName" required autoComplete="off" /></Field>
      <Field label="شماره همراه" name="mobile" hint="نام کاربری دبیر">
        <Input name="mobile" type="tel" inputMode="tel" dir="ltr" required placeholder="09120000000" className="text-start" autoComplete="off" />
      </Field>
      <Field label="کد پرسنلی" name="personnelCode" hint="اختیاری"><Input name="personnelCode" dir="ltr" className="text-start" /></Field>

      <p className="text-xs leading-6 text-muted sm:col-span-2">
        با ثبت این فرم، حساب دبیر ساخته می‌شود و یک پیوند فعال‌سازی یک‌بارمصرف نمایش داده می‌شود تا آن را برای او بفرستید. دبیر با آن پیوند گذرواژه‌ی خودش را تعیین می‌کند؛ مدرسه گذرواژه‌ای تعیین نمی‌کند.
      </p>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton size="lg" pendingLabel="در حال ساخت حساب…">افزودن دبیر</SubmitButton>
        <Link href="/teachers" className="text-xs font-bold text-muted hover:text-primary">انصراف</Link>
      </div>

      <div className="sm:col-span-2">
        <ActionFeedback state={state} />
      </div>
    </form>
  );
}

/**
 * The activation link, shown once, with a copy action.
 *
 * This is the entire delivery mechanism for now: no SMS or email provider exists,
 * so the admin passes the link along through the channel they already use. The
 * plaintext token is never persisted, so this is also the last time it is visible.
 */
export function ActivationLink({ url, expiresAt }: { url: string; expiresAt: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused; the link stays selectable regardless.
      setCopied(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-bold text-muted">پیوند فعال‌سازی</p>
      <p className="mt-2 break-all rounded-xl bg-background p-3 text-xs leading-6 text-primary" dir="ltr">{url}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-9 items-center rounded-xl border border-secondary/25 bg-secondary/10 px-3 text-xs font-bold text-secondary hover:bg-secondary/15"
        >
          {copied ? "کپی شد" : "کپی پیوند"}
        </button>
        <span role="status" className="text-xs text-muted">
          {copied ? "پیوند در حافظه کپی شد." : "این پیوند فقط یک‌بار قابل استفاده است."}
        </span>
      </div>
      <p className="mt-3 text-xs leading-6 text-muted">
        اعتبار پیوند تا {formatStoredExpiry(expiresAt)}. با ارسال دوباره‌ی دعوت، این پیوند باطل می‌شود.
      </p>
    </div>
  );
}

/**
 * Renders the invitation expiry in the Persian calendar.
 *
 * The value is an instant, so only its calendar date is shown; a time-of-day
 * would imply a precision the admin does not act on.
 */
function formatStoredExpiry(expiresAt: string) {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "نامشخص";
  const iso = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return formatPersianDateShort(iso);
}
