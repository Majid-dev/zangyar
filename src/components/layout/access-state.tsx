import Link from "next/link";

import { BrandLockup } from "@/components/layout/brand";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

export type AccessState = "UNAUTHENTICATED" | "NO_SCHOOL" | "FORBIDDEN";

const MESSAGES: Record<AccessState, { title: string; message: string }> = {
  UNAUTHENTICATED: {
    title: "ورود لازم است",
    message: "برای مشاهده این صفحه ابتدا وارد حساب کاربری شوید.",
  },
  NO_SCHOOL: {
    title: "دسترسی مدرسه یافت نشد",
    message: "این حساب هنوز عضویت فعال مدرسه ندارد. برای دسترسی، از مدیر مدرسه بخواهید شما را به مدرسه اضافه کند.",
  },
  FORBIDDEN: {
    title: "دسترسی محدود است",
    message: "این صفحه فقط برای مدیر مدرسه در دسترس است.",
  },
};

export function accessStateFor(state: AccessState) {
  return <AccessState state={state} />;
}

export function AccessState({ state }: { state: AccessState }) {
  const { title, message } = MESSAGES[state];
  // Only an unauthenticated visitor benefits from a login link; everyone else
  // already has a session, so the useful action is switching accounts.
  const action =
    state === "UNAUTHENTICATED" ? (
      <Link
        href="/login"
        className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary/90"
      >
        ورود به حساب
      </Link>
    ) : (
      <div className="mt-6 flex justify-center">
        <SignOutButton className="border border-border bg-surface" />
      </div>
    );

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
      <section className="w-full rounded-3xl border border-border bg-surface p-8 text-center shadow-[0_14px_40px_rgba(23,59,87,0.06)]">
        <span className="flex justify-center">
          <BrandLockup size={44} showTagline={false} />
        </span>
        <h1 className="mt-4 text-3xl font-black text-primary">{title}</h1>
        <p className="mt-4 leading-8 text-muted">{message}</p>
        {action}
      </section>
    </main>
  );
}
