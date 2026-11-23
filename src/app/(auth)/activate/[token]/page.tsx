import type { Metadata } from "next";
import Link from "next/link";

import { resolveActivationToken } from "@/features/teachers/queries";
import { TeacherActivationForm } from "@/features/teachers/components/activation-form";

/**
 * Activation is deliberately not indexable and not referrer-leaking: the URL
 * carries a one-time token, so it must not end up in a search index or be passed
 * along in a Referer header to a third party.
 */
export const metadata: Metadata = {
  title: "فعال‌سازی حساب | زنگ‌یار",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/**
 * Public activation surface.
 *
 * It lives in the `(auth)` group rather than `(app)` because `(app)` redirects an
 * unauthenticated visitor to login, and the whole point of this page is that the
 * teacher has no session yet. Nothing here is authorized by a client value: the
 * token in the path is the only credential, and the school, account, and role are
 * resolved from the invitation row server-side.
 */
export default async function ActivateTeacherPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await resolveActivationToken(token);

  if (!preview || !preview.usable) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-black text-white">ز</span>
            <span className="text-base font-black tracking-tight text-primary">زنگ‌یار</span>
          </div>

          <div className="mt-10">
            <p className="text-xs font-extrabold tracking-[0.08em] text-secondary">فعال‌سازی حساب</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-primary">این پیوند قابل استفاده نیست.</h1>
            <p className="mt-4 text-sm leading-7 text-muted">
              پیوند فعال‌سازی منقضی شده، لغو شده، یا قبلاً استفاده شده است. برای دریافت پیوند تازه با مدیر مدرسه تماس بگیرید.
            </p>
            <Link href="/login" className="mt-7 inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-bold text-primary hover:border-secondary/40 hover:text-secondary">
              بازگشت به صفحه‌ی ورود
            </Link>
          </div>
        </div>
      </main>
    );
  }

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
          <p className="text-xs font-bold tracking-[0.12em] text-secondary">یک قدم تا شروع</p>
          <h1 className="mt-4 text-4xl font-black leading-[1.4] xl:text-5xl">حساب شما آماده است.</h1>
          <p className="mt-5 max-w-md text-sm leading-8 text-white/70">
            با تعیین گذرواژه، امکان ورود به زنگ‌یار برای شما فعال می‌شود و می‌توانید کلاس‌ها و حضور و غیاب را مدیریت کنید.
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
            <p className="text-xs font-extrabold tracking-[0.08em] text-secondary">فعال‌سازی حساب</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-primary">تعیین گذرواژه</h2>
          </div>

          <TeacherActivationForm token={token} teacherName={preview.teacherName} schoolName={preview.schoolName} />
        </div>
      </section>
    </main>
  );
}
