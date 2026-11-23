"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { buttonClasses } from "@/components/ui/button";
import { normalizeIranianMobile } from "@/lib/mobile";
import { requestOtpCode, resetPasswordWithOtp } from "@/lib/auth/otp-client";

type Failure = { message: string; field?: "mobile" | "code" | "password" | "form" };

/**
 * Password recovery by one-time code.
 *
 * The request step answers identically whether or not the number has an account, so
 * it cannot be used to discover which numbers are registered. A successful reset
 * also revokes other sessions server-side.
 */
export function ResetPasswordForm() {
  const mobileId = useId();
  const codeId = useId();
  const passwordId = useId();

  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  function normalizedMobileOrFail() {
    const normalized = normalizeIranianMobile(mobile);
    if (!normalized || !/^09\d{9}$/.test(normalized)) {
      setFailure({ message: "شماره همراه باید با ۰۹ شروع شود و ۱۱ رقم باشد.", field: "mobile" });
      return null;
    }
    return normalized;
  }

  async function onRequestCode() {
    if (pending) return;
    const normalized = normalizedMobileOrFail();
    if (!normalized) return;

    setPending(true);
    setFailure(null);
    const result = await requestOtpCode({ purpose: "PASSWORD_RESET", mobile: normalized });
    setPending(false);

    if (result.status === 429) {
      setFailure({ message: "تعداد درخواست کد زیاد بوده است. کمی بعد دوباره تلاش کنید.", field: "form" });
      return;
    }
    setCodeSent(true);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const normalized = normalizedMobileOrFail();
    if (!normalized) return;
    if (code.trim().length === 0) {
      setFailure({ message: "کد تأیید را وارد کنید.", field: "code" });
      return;
    }
    if (password.length < 8) {
      setFailure({ message: "گذرواژه باید حداقل ۸ نویسه باشد.", field: "password" });
      return;
    }

    setPending(true);
    setFailure(null);
    const result = await resetPasswordWithOtp({ mobile: normalized, code: code.trim(), newPassword: password });
    setPending(false);

    if (!result.ok) {
      setFailure({ message: "کد تأیید نامعتبر است یا منقضی شده است.", field: "code" });
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mt-8 space-y-5">
        <div className="rounded-2xl border border-success/25 bg-success/8 p-5">
          <p className="text-sm font-black text-success">گذرواژه تغییر کرد.</p>
          <p className="mt-2 text-sm leading-7 text-muted">
            اکنون می‌توانید با گذرواژه‌ی تازه وارد شوید. برای امنیت بیشتر، نشست‌های قبلی شما بسته شد.
          </p>
        </div>
        <Link href="/login" className={buttonClasses({ size: "lg" })}>بازگشت به صفحه‌ی ورود</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 grid gap-5">
      <div className="grid gap-2">
        <label htmlFor={mobileId} className="text-sm font-bold text-primary">شماره همراه</label>
        <input
          id={mobileId}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          required
          disabled={pending}
          value={mobile}
          onChange={(event) => setMobile(event.target.value)}
          aria-invalid={failure?.field === "mobile" || undefined}
          placeholder="09120000000"
          className="min-h-12 w-full rounded-xl border border-border bg-surface px-3.5 text-start text-base tracking-[0.06em] text-foreground outline-none transition placeholder:text-muted/60 focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:opacity-60"
        />
        {failure?.field === "mobile" ? <p role="alert" className="text-xs font-bold text-danger">{failure.message}</p> : null}
      </div>

      <div className="grid gap-3">
        <button type="button" onClick={onRequestCode} disabled={pending} className={buttonClasses({ variant: "secondary", size: "md", className: "w-full" })}>
          {pending ? "در حال ارسال…" : codeSent ? "ارسال دوباره‌ی کد" : "ارسال کد تأیید"}
        </button>
        {codeSent ? (
          <p role="status" className="text-xs leading-6 text-muted">اگر این شماره در زنگ‌یار حساب داشته باشد، کد تأیید ارسال شده است.</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label htmlFor={codeId} className="text-sm font-bold text-primary">کد تأیید</label>
        <input
          id={codeId}
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          required
          disabled={pending}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="min-h-12 w-full rounded-xl border border-border bg-surface px-3.5 text-start text-base tracking-[0.3em] text-foreground outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:opacity-60"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor={passwordId} className="text-sm font-bold text-primary">گذرواژه‌ی تازه</label>
        <input
          id={passwordId}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={pending}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="min-h-12 w-full rounded-xl border border-border bg-surface px-3.5 text-base text-foreground outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:opacity-60"
        />
      </div>

      {failure && (failure.field === "code" || failure.field === "password" || failure.field === "form") ? (
        <p role="alert" className="rounded-xl border border-danger/25 bg-danger/8 px-3.5 py-3 text-sm font-bold leading-6 text-danger">{failure.message}</p>
      ) : null}

      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonClasses({ size: "lg", className: "w-full" })}>
        {pending ? "در حال تغییر…" : "تغییر گذرواژه"}
      </button>

      <p className="text-xs leading-6 text-muted">
        کد تأیید فقط یک‌بار قابل استفاده است. <Link href="/login" className="font-bold text-secondary hover:text-primary">بازگشت به ورود</Link>
      </p>
    </form>
  );
}
