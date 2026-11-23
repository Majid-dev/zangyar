import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";
import { headers } from "next/headers";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "ورود | زنگ‌یار",
  description: "ورود مدیران و دبیران مدرسه به زنگ‌یار",
};

const FRAME_BULLETS = [
  "ثبت حضور و غیاب روزانه، در چند ثانیه",
  "اطلاع‌رسانی پیامکی به خانواده‌ها",
  "گزارش‌های مدرسه‌ای، بدون کاغذبازی",
];

/**
 * Login surface. Mobile number is the only credential path offered; an already
 * authenticated visitor is sent straight to the dashboard rather than being
 * asked to sign in again.
 */
export default async function LoginPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (session?.user) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      {/* Editorial panel: the product's promise, not a decorative hero. */}
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
          <p className="text-xs font-bold tracking-[0.12em] text-secondary">سامانه مدیریت مدرسه</p>
          <h1 className="mt-4 text-4xl font-black leading-[1.4] xl:text-5xl">هر روز مدرسه، روشن و بی‌دغدغه.</h1>
          <p className="mt-5 max-w-md text-sm leading-8 text-white/70">
            زنگ‌یار کارهای روزمره مدرسه را ساده می‌کند تا وقت بیشتری برای آموزش و ارتباط با خانواده‌ها بماند.
          </p>

          <ul className="mt-9 space-y-3.5">
            {FRAME_BULLETS.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-white/85">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-secondary" aria-hidden="true">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/45">ساخته‌شده برای مدارس ایران · تقویم و ساعت محلی تهران</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10 lg:min-h-0">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-black text-white">ز</span>
            <span>
              <span className="block text-base font-black tracking-tight text-primary">زنگ‌یار</span>
              <span className="block text-[11px] text-muted">مدرسه در جریان، خانواده در کنار</span>
            </span>
          </div>

          <div className="mt-10 lg:mt-0">
            <p className="text-xs font-extrabold tracking-[0.08em] text-secondary">ورود به حساب</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-primary">خوش آمدید</h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              با شماره همراه و گذرواژه‌ای که مدیر مدرسه برای شما ثبت کرده وارد شوید.
            </p>
          </div>

          <LoginForm />
        </div>
      </section>
    </main>
  );
}
