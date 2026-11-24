import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export const metadata: Metadata = {
  title: "بازیابی گذرواژه | زنگ‌یار",
  description: "بازیابی گذرواژه‌ی حساب زنگ‌یار با کد یک‌بارمصرف",
};

/**
 * Password recovery surface.
 *
 * Public, like login: an authenticated visitor is sent on rather than asked to
 * recover a password they can already use.
 */
export default async function ResetPasswordPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (session?.user) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-primary px-12 py-14 text-white lg:flex xl:px-16">
        <span className="absolute -end-24 top-24 size-72 rounded-full border-[26px] border-white/5" aria-hidden="true" />
        <span className="absolute -start-16 bottom-10 size-56 rounded-full bg-secondary/15" aria-hidden="true" />

        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-white/10 text-lg font-black">ز</span>
          <span>
            <span className="block text-base font-black tracking-tight">زنگ‌یار</span>
            <span className="block text-[11px] text-white/60">مدرسه در جریان، خانواده در کنار</span>
          </span>
        </div>

        <div className="relative max-w-lg">
          <p className="text-xs font-bold tracking-[0.12em] text-secondary">بازیابی دسترسی</p>
          <h1 className="mt-4 text-4xl font-black leading-[1.4] xl:text-5xl">گذرواژه‌ی تازه، در چند لحظه.</h1>
          <p className="mt-5 max-w-md text-sm leading-8 text-white/70">
            با شماره همراه خود یک کد یک‌بارمصرف دریافت کنید و گذرواژه‌ی تازه تعیین کنید.
          </p>
        </div>

        <p className="relative text-xs text-white/45">ساخته‌شده برای مدارس ایران · تقویم و ساعت محلی تهران</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10 lg:min-h-0">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-black text-white">ز</span>
            <span className="text-base font-black tracking-tight text-primary">زنگ‌یار</span>
          </div>

          <div className="mt-10 lg:mt-0">
            <p className="text-xs font-extrabold tracking-[0.08em] text-secondary">بازیابی گذرواژه</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-primary">گذرواژه‌ی تازه</h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              کد تأیید به شماره همراه حساب شما ارسال می‌شود. اگر کد را دریافت نکردید، از مدیر مدرسه کمک بگیرید.
            </p>
          </div>

          <ResetPasswordForm />

          <p className="mt-8 text-xs leading-6 text-muted">
            <Link href="/login" className="font-bold text-secondary hover:text-primary">بازگشت به صفحه‌ی ورود</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
