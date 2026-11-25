import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";
import { BrandLockup } from "@/components/layout/brand";
import { TeacherRegistrationForm } from "@/features/teachers/components/register-form";

export const metadata: Metadata = {
  title: "ثبت‌نام دبیر | زنگ‌یار",
  description: "ثبت‌نام دبیر با شماره همراهی که مدیر مدرسه ثبت کرده است",
};

/**
 * Public teacher registration.
 *
 * No token and no session: eligibility is the mobile number having been authorized
 * by a School Admin, which the server checks. An authenticated visitor is sent on
 * rather than asked to register again.
 */
export default async function RegisterPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (session?.user) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-primary px-12 py-14 text-white lg:flex xl:px-16">
        <span className="absolute -end-24 top-24 size-72 rounded-full border-[26px] border-white/5" aria-hidden="true" />
        <span className="absolute -start-16 bottom-10 size-56 rounded-full bg-secondary/15" aria-hidden="true" />

        <div className="relative">
          <BrandLockup tone="dark" size={44} />
        </div>

        <div className="relative max-w-lg">
          <p className="text-xs font-bold tracking-[0.12em] text-secondary">ثبت‌نام دبیر</p>
          <h1 className="mt-4 text-4xl font-black leading-[1.4] xl:text-5xl">با شماره‌ای که مدرسه ثبت کرده، وارد شوید.</h1>
          <p className="mt-5 max-w-md text-sm leading-8 text-white/70">
            مدیر مدرسه شماره همراه شما را ثبت می‌کند؛ شما با همان شماره ثبت‌نام می‌کنید، کد تأیید را وارد می‌کنید و گذرواژه‌ی خودتان را تعیین می‌کنید.
          </p>
        </div>

        <p className="relative text-xs text-white/45">ساخته‌شده برای مدارس ایران · تقویم و ساعت محلی تهران</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10 lg:min-h-0">
        <div className="w-full max-w-md">
          <div className="lg:hidden">
            <BrandLockup size={44} showTagline={false} />
          </div>

          <div className="mt-10 lg:mt-0">
            <p className="text-xs font-extrabold tracking-[0.08em] text-secondary">ثبت‌نام</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-primary">ثبت‌نام دبیر</h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              فقط شماره‌هایی می‌توانند ثبت‌نام کنند که مدیر مدرسه آن‌ها را ثبت کرده باشد.
            </p>
          </div>

          <TeacherRegistrationForm />

          <p className="mt-8 text-xs leading-6 text-muted">
            <Link href="/login" className="font-bold text-secondary hover:text-primary">بازگشت به صفحه‌ی ورود</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
