"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/layout/icon";
import { changeOwnPasswordAction, updateOwnProfileAction } from "../actions";

/**
 * Basic account information.
 *
 * Only the display name is editable, and the form says so rather than leaving the
 * mobile number looking like a field that merely failed to save: the number is
 * the login identity, and changing it is a separate, authorized operation. Role,
 * school membership, and account status are not inputs at all, so no crafted post
 * can reach them.
 *
 * The two name fields are controlled. React resets an uncontrolled form after an
 * action runs, so a rejected save would otherwise wipe what the user typed and
 * they would be correcting an empty form. A rejected value is also re-seeded from
 * the server's latest read, which only changes underneath them if an admin edited
 * them elsewhere meanwhile.
 *
 * On success the shell is refreshed, so the profile menu picks up the saved value
 * rather than optimistic client state.
 */
export function AccountProfileForm({
  firstName,
  lastName,
  mobile,
  mobileVerified,
}: {
  firstName: string;
  lastName: string;
  mobile: string | null;
  mobileVerified: boolean;
}) {
  const router = useRouter();
  const mobileId = useId();
  const [name, setName] = useState({ firstName, lastName });

  // Re-seed when the server's value changes, so the fields never silently reset to
  // stale text, while leaving anything the user is mid-edit alone.
  const [seeded, setSeeded] = useState({ firstName, lastName });
  if (seeded.firstName !== firstName || seeded.lastName !== lastName) {
    setSeeded({ firstName, lastName });
    setName({ firstName, lastName });
  }

  return (
    <ActionForm
      action={updateOwnProfileAction}
      className="grid gap-4 sm:grid-cols-2"
      onSuccess={() => router.refresh()}
    >
      <Field label="نام" name="firstName">
        <Input
          name="firstName"
          value={name.firstName}
          onChange={(event) => setName((current) => ({ ...current, firstName: event.target.value }))}
          autoComplete="given-name"
          required
          maxLength={100}
        />
      </Field>
      {/* An account that has never saved a name pair has no last name to show, and
          the whole stored name is in the field above. The hint explains the empty
          field rather than letting a save fail on a required input with no reason
          given: splitting it is the user's call, which is the point. */}
      <Field
        label="نام خانوادگی"
        name="lastName"
        hint={name.lastName.length === 0 && name.firstName.trim().length > 0 ? "اگر نام شما بیش از یک بخش دارد، بخش دوم را این‌جا بنویسید" : undefined}
      >
        <Input
          name="lastName"
          value={name.lastName}
          onChange={(event) => setName((current) => ({ ...current, lastName: event.target.value }))}
          autoComplete="family-name"
          required
          maxLength={100}
        />
      </Field>

      {/* Read-only rather than disabled: a disabled control is skipped by keyboard
          navigation, and this value is worth reading and copying. */}
      <div className="grid gap-2 sm:col-span-2">
        <label htmlFor={mobileId} className="flex items-center justify-between gap-3 text-sm font-bold text-primary">
          <span>شماره همراه</span>
          <span className="text-xs font-normal text-muted">
            {mobileVerified ? "تأییدشده" : "تأییدنشده"} · نام کاربری ورود
          </span>
        </label>
        <input
          id={mobileId}
          dir="ltr"
          readOnly
          value={mobile ?? "—"}
          aria-describedby={`${mobileId}-hint`}
          className="min-h-11 w-full cursor-default rounded-xl border border-border bg-sage/50 px-3.5 text-start text-sm tracking-[0.04em] text-muted outline-none"
        />
        <p id={`${mobileId}-hint`} className="text-xs leading-6 text-muted">
          شماره همراه، نام کاربری ورود شماست و از این صفحه تغییر نمی‌کند. برای تغییر آن با مدیر مدرسه تماس بگیرید.
        </p>
      </div>

      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="در حال ذخیره…">ذخیره‌ی اطلاعات</SubmitButton>
      </div>
    </ActionForm>
  );
}

/**
 * Password change.
 *
 * The current password is required and is proven by the auth server against the
 * stored hash; this form never learns or forwards a hash. Each field has its own
 * visibility toggle, because confirming a mistyped new password is the whole
 * reason the confirmation field exists.
 */
export function AccountPasswordForm() {
  return (
    <ActionForm action={changeOwnPasswordAction} className="grid gap-4">
      <PasswordField label="گذرواژه‌ی فعلی" name="currentPassword" autoComplete="current-password" />
      <PasswordField label="گذرواژه‌ی تازه" name="newPassword" autoComplete="new-password" hint="حداقل ۸ نویسه" />
      <PasswordField label="تکرار گذرواژه‌ی تازه" name="confirmPassword" autoComplete="new-password" />

      <p className="rounded-xl bg-sage/70 px-3.5 py-3 text-xs leading-6 text-muted">
        پس از تغییر، همین نشست و نشست‌های دیگر شما فعال می‌مانند و لازم نیست دوباره وارد شوید. گذرواژه به‌صورت متن ساده ذخیره یا ثبت نمی‌شود.
      </p>

      <div>
        <SubmitButton pendingLabel="در حال تغییر…">تغییر گذرواژه</SubmitButton>
      </div>
    </ActionForm>
  );
}

function PasswordField({
  label,
  name,
  autoComplete,
  hint,
}: {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  return (
    <Field label={label} name={name} hint={hint}>
      <span className="relative flex items-center">
        <Input
          id={inputId}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={8}
          maxLength={128}
          className="pe-12"
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? `پنهان کردن ${label}` : `نمایش ${label}`}
          aria-pressed={visible}
          aria-controls={inputId}
          className="absolute end-1.5 flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sage hover:text-primary"
        >
          <Icon name={visible ? "eye-off" : "eye"} />
        </button>
      </span>
    </Field>
  );
}
