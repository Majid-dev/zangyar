"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { buttonClasses } from "@/components/ui/button";
import { normalizeIranianMobile } from "@/lib/mobile";
import { signIn } from "@/lib/auth/client";
import { loginWithOtp, requestOtpCode } from "@/lib/auth/otp-client";

type Failure = { message: string; field?: "mobile" | "password" | "code" | "form" };
type Mode = "password" | "otp";

/**
 * Sign-in surface.
 *
 * Two paths: mobile + password (the original), and mobile + one-time code. The
 * login identity is the mobile number either way. Failures stay deliberately
 * generic — the form never reveals whether a mobile number has an account.
 */
export function LoginForm() {
  const router = useRouter();
  const mobileId = useId();
  const passwordId = useId();
  const codeId = useId();

  const [mode, setMode] = useState<Mode>("password");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  function normalizedMobileOrFail() {
    const normalized = normalizeIranianMobile(mobile);
    if (!normalized || !/^09\d{9}$/.test(normalized)) {
      setFailure({ message: "شماره همراه باید با ۰۹ شروع شود و ۱۱ رقم باشد.", field: "mobile" });
      return null;
    }
    return normalized;
  }

  function switchMode(next: Mode) {
    setMode(next);
    setFailure(null);
    setCodeSent(false);
    setCode("");
  }

  async function onSubmitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const normalized = normalizedMobileOrFail();
    if (!normalized) return;
    if (password.length === 0) {
      setFailure({ message: "گذرواژه را وارد کنید.", field: "password" });
      return;
    }

    setPending(true);
    setFailure(null);

    const { error } = await signIn.phoneNumber({ phoneNumber: normalized, password });

    if (error) {
      setPending(false);
      setFailure({
        message: error.status === 400 ? "شماره همراه واردشده معتبر نیست." : "شماره همراه یا گذرواژه درست نیست.",
        field: error.status === 400 ? "mobile" : "form",
      });
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function onRequestCode() {
    if (pending) return;
    const normalized = normalizedMobileOrFail();
    if (!normalized) return;

    setPending(true);
    setFailure(null);

    // The endpoint answers the same way whether or not the number has an account,
    // so this message never confirms that an account exists.
    const result = await requestOtpCode({ purpose: "LOGIN", mobile: normalized });
    setPending(false);

    if (result.status === 429) {
      setFailure({ message: "تعداد درخواست کد زیاد بوده است. کمی بعد دوباره تلاش کنید.", field: "form" });
      return;
    }

    setCodeSent(true);
    setFailure(null);
  }

  async function onSubmitOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const normalized = normalizedMobileOrFail();
    if (!normalized) return;
    if (code.trim().length === 0) {
      setFailure({ message: "کد تأیید را وارد کنید.", field: "code" });
      return;
    }

    setPending(true);
    setFailure(null);

    const result = await loginWithOtp({ mobile: normalized, code: code.trim() });
    setPending(false);

    if (!result.ok) {
      setFailure({ message: "کد تأیید نامعتبر است یا منقضی شده است.", field: "code" });
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mt-8">
      {/* Two sign-in paths; the mobile number identifies the account either way. */}
      <div role="tablist" aria-label="روش ورود" className="flex gap-1 rounded-xl bg-sage/60 p-1">
        {([["password", "گذرواژه"], ["otp", "کد یک‌بارمصرف"]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            disabled={pending}
            className={`min-h-9 flex-1 rounded-lg text-xs font-bold transition ${mode === value ? "bg-surface text-primary shadow-[0_2px_8px_rgba(23,59,87,0.08)]" : "text-muted hover:text-primary"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <form onSubmit={onSubmitPassword} noValidate className="mt-6 grid gap-5">
          <MobileField id={mobileId} value={mobile} onChange={setMobile} disabled={pending} failure={failure} />
          <div className="grid gap-2">
            <label htmlFor={passwordId} className="text-sm font-bold text-primary">گذرواژه</label>
            <input
              id={passwordId}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={failure?.field === "password" || undefined}
              className="min-h-12 w-full rounded-xl border border-border bg-surface px-3.5 text-base text-foreground outline-none transition placeholder:text-muted/60 focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:opacity-60"
            />
            {failure?.field === "password" ? <p role="alert" className="text-xs font-bold text-danger">{failure.message}</p> : null}
          </div>

          {failure?.field === "form" ? <FormError message={failure.message} /> : null}

          <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonClasses({ size: "lg", className: "w-full" })}>
            {pending ? "در حال ورود…" : "ورود به زنگ‌یار"}
          </button>
        </form>
      ) : (
        <form onSubmit={onSubmitOtp} noValidate className="mt-6 grid gap-5">
          <MobileField id={mobileId} value={mobile} onChange={setMobile} disabled={pending} failure={failure} />

          <div className="grid gap-3">
            <button
              type="button"
              onClick={onRequestCode}
              disabled={pending}
              className={buttonClasses({ variant: "secondary", size: "md", className: "w-full" })}
            >
              {pending ? "در حال ارسال…" : codeSent ? "ارسال دوباره‌ی کد" : "ارسال کد تأیید"}
            </button>
            {codeSent ? (
              <p role="status" className="text-xs leading-6 text-muted">
                اگر این شماره در زنگ‌یار حساب داشته باشد، کد تأیید ارسال شده است.
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <label htmlFor={codeId} className="text-sm font-bold text-primary">کد تأیید</label>
            <input
              id={codeId}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              required
              disabled={pending}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-invalid={failure?.field === "code" || undefined}
              className="min-h-12 w-full rounded-xl border border-border bg-surface px-3.5 text-start text-base tracking-[0.3em] text-foreground outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:opacity-60"
            />
            {failure?.field === "code" ? <p role="alert" className="text-xs font-bold text-danger">{failure.message}</p> : null}
          </div>

          {failure?.field === "form" ? <FormError message={failure.message} /> : null}

          <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonClasses({ size: "lg", className: "w-full" })}>
            {pending ? "در حال ورود…" : "ورود با کد تأیید"}
          </button>
        </form>
      )}

      <p className="mt-6 text-xs leading-6 text-muted">
        {mode === "password"
          ? "ورود فقط با شماره همراه مدیر یا دبیر مدرسه انجام می‌شود. اگر حساب ندارید، از مدیر مدرسه بخواهید شما را به مدرسه اضافه کند."
          : "کد یک‌بارمصرف به شماره همراه شما ارسال می‌شود. اگر کد را دریافت نکردید، از روش گذرواژه استفاده کنید."}
      </p>
    </div>
  );
}

function MobileField({ id, value, onChange, disabled, failure }: { id: string; value: string; onChange: (value: string) => void; disabled: boolean; failure: Failure | null }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-bold text-primary">شماره همراه</label>
      <input
        id={id}
        name="mobile"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        dir="ltr"
        required
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={failure?.field === "mobile" || undefined}
        aria-describedby={failure?.field === "mobile" ? `${id}-error` : undefined}
        placeholder="09120000000"
        className="min-h-12 w-full rounded-xl border border-border bg-surface px-3.5 text-start text-base tracking-[0.06em] text-foreground outline-none transition placeholder:text-muted/60 focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:opacity-60"
      />
      {failure?.field === "mobile" ? <p id={`${id}-error`} role="alert" className="text-xs font-bold text-danger">{failure.message}</p> : null}
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return <p role="alert" className="rounded-xl border border-danger/25 bg-danger/8 px-3.5 py-3 text-sm font-bold leading-6 text-danger">{message}</p>;
}
