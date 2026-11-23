"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { buttonClasses } from "@/components/ui/button";
import { normalizeIranianMobile } from "@/lib/mobile";
import { signIn } from "@/lib/auth/client";

type Failure = { message: string; field?: "mobile" | "password" | "form" };

/**
 * Mobile-number sign-in form.
 *
 * The product login identity is the Iranian mobile number, so the input is
 * normalized client-side for a friendlier round trip; the server re-validates
 * and normalizes independently. Failures are deliberately generic: the form
 * never reveals whether a mobile number has an account.
 */
export function LoginForm() {
  const router = useRouter();
  const mobileId = useId();
  const passwordId = useId();

  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const normalized = normalizeIranianMobile(mobile);
    if (!normalized || !/^09\d{9}$/.test(normalized)) {
      setFailure({ message: "شماره همراه باید با ۰۹ شروع شود و ۱۱ رقم باشد.", field: "mobile" });
      return;
    }
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
        message:
          error.status === 400
            ? "شماره همراه واردشده معتبر نیست."
            : "شماره همراه یا گذرواژه درست نیست.",
        field: error.status === 400 ? "mobile" : "form",
      });
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 grid gap-5">
      <div className="grid gap-2">
        <label htmlFor={mobileId} className="text-sm font-bold text-primary">
          شماره همراه
        </label>
        <input
          id={mobileId}
          name="mobile"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          required
          disabled={pending}
          value={mobile}
          onChange={(event) => setMobile(event.target.value)}
          aria-invalid={failure?.field === "mobile" || undefined}
          aria-describedby={failure?.field === "mobile" ? `${mobileId}-error` : undefined}
          placeholder="09120000000"
          className="min-h-12 w-full rounded-xl border border-border bg-surface px-3.5 text-start text-base tracking-[0.06em] text-foreground outline-none transition placeholder:text-muted/60 focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:opacity-60"
        />
        {failure?.field === "mobile" ? (
          <p id={`${mobileId}-error`} role="alert" className="text-xs font-bold text-danger">
            {failure.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label htmlFor={passwordId} className="text-sm font-bold text-primary">
          گذرواژه
        </label>
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
          aria-describedby={failure?.field === "password" ? `${passwordId}-error` : undefined}
          className="min-h-12 w-full rounded-xl border border-border bg-surface px-3.5 text-base text-foreground outline-none transition placeholder:text-muted/60 focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:opacity-60"
        />
        {failure?.field === "password" ? (
          <p id={`${passwordId}-error`} role="alert" className="text-xs font-bold text-danger">
            {failure.message}
          </p>
        ) : null}
      </div>

      {failure?.field === "form" ? (
        <p role="alert" className="rounded-xl border border-danger/25 bg-danger/8 px-3.5 py-3 text-sm font-bold leading-6 text-danger">
          {failure.message}
        </p>
      ) : null}

      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonClasses({ size: "lg", className: "w-full" })}>
        {pending ? "در حال ورود…" : "ورود به زنگ‌یار"}
      </button>

      <p className="text-xs leading-6 text-muted">
        ورود فقط با شماره همراه مدیر یا دبیر مدرسه انجام می‌شود. اگر حساب ندارید، از مدیر مدرسه بخواهید شما را به مدرسه اضافه کند.
      </p>
    </form>
  );
}
