"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { ActionFeedback, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import type { ActionState } from "@/lib/actions/result";

import { registerTeacherMobileAction } from "../actions";

/**
 * Authorize a mobile number to join the school.
 *
 * The form and its result live in a child keyed by a round counter, because the
 * action's state is what decides which of the two to show. "افزودن شماره دیگر"
 * therefore bumps the counter to remount the child with a fresh `useActionState`,
 * rather than clearing state in place or navigating to this same route — a
 * same-route navigation does not reset the hook, which is why the button used to
 * do nothing.
 */
export function TeacherCreateForm() {
  const [round, setRound] = useState(0);

  return (
    <SingleNumberForm
      key={round}
      onAddAnother={() => setRound((value) => value + 1)}
    />
  );
}

/**
 * Authorizes one number.
 *
 * Only the number is asked for. The admin is asserting "this number may join us" —
 * the person's name and personnel code are theirs to give when they register, so
 * asking for them here would record details nobody has confirmed.
 */
function SingleNumberForm({ onAddAnother }: { onAddAnother: () => void }) {
  const [state, formAction] = useActionState<ActionState<unknown>, FormData>(registerTeacherMobileAction, null);

  if (state?.ok) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-success/25 bg-success/8 p-5">
          <p className="text-sm font-black text-success">شماره همراه ثبت شد.</p>
          <p className="mt-2 text-sm leading-7 text-muted">
            از این پس هر کسی که این شماره همراه را در اختیار دارد می‌تواند از صفحه‌ی ثبت‌نام، مشخصات خود را وارد کند. تا زمانی که شما ثبت‌نام او را تأیید نکنید، به منابع مدرسه دسترسی ندارد.
          </p>
          <p className="mt-3 text-xs leading-6 text-muted">
            نام، کد پرسنلی و گذرواژه را خود دبیر هنگام ثبت‌نام تعیین می‌کند؛ نیازی به ارسال پیامک یا پیوند دعوت نیست.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/teachers" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90">
            بازگشت به فهرست دبیران
          </Link>
          <button
            type="button"
            onClick={onAddAnother}
            className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-bold text-primary hover:border-secondary/40 hover:text-secondary"
          >
            افزودن شماره دیگر
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <Field label="شماره همراه" name="mobile" hint="نام کاربری دبیر">
        <Input name="mobile" type="tel" inputMode="tel" dir="ltr" required placeholder="09120000000" className="text-start" autoComplete="off" />
      </Field>

      <p className="text-xs leading-6 text-muted">
        با ثبت این فرم، فقط همین شماره همراه مجاز می‌شود که در مدرسه‌ی شما ثبت‌نام کند. حساب کاربری ساخته نمی‌شود و دعوتی ارسال نمی‌گردد؛ دبیر خودش از صفحه‌ی <Link href="/register" className="font-bold text-secondary hover:text-primary">ثبت‌نام</Link> نام، کد پرسنلی و گذرواژه‌اش را تعیین می‌کند.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="lg" pendingLabel="در حال ثبت…">ثبت شماره همراه</SubmitButton>
        <Link href="/teachers" className="text-xs font-bold text-muted hover:text-primary">انصراف</Link>
      </div>

      <ActionFeedback state={state} />
    </form>
  );
}
