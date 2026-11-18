import Link from "next/link";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";
import { requireSchoolAccess } from "@/lib/auth/authorization";

export default async function AcademicsPage() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
        <section className="w-full rounded-3xl bg-surface p-8 text-center shadow-sm ring-1 ring-border">
          <p className="text-sm font-bold text-secondary">مدیریت آموزشی</p>
          <h1 className="mt-3 text-3xl font-black text-primary">ورود لازم است</h1>
          <p className="mt-4 text-muted">برای مشاهده اطلاعات مدرسه، ابتدا وارد حساب کاربری شوید.</p>
          <Link href="/" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">بازگشت</Link>
        </section>
      </main>
    );
  }

  try {
    await requireSchoolAccess({ headers: await headers() });
  } catch {
    return <main className="mx-auto max-w-3xl p-6"><section className="rounded-3xl bg-surface p-8 text-center ring-1 ring-border"><h1 className="text-2xl font-black text-primary">دسترسی مدرسه یافت نشد</h1><p className="mt-3 text-muted">این حساب هنوز عضویت فعال مدرسه ندارد.</p></section></main>;
  }

  return <AcademicsDashboard />;
}

async function AcademicsDashboard() {
  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-secondary">زنگ‌یار / مدیریت آموزشی</p>
            <h1 className="mt-2 text-3xl font-black text-primary">مدرسه و ساختار آموزشی</h1>
            <p className="mt-2 text-sm text-muted">سال تحصیلی، پایه‌ها، درس‌ها و کلاس‌ها را در یک نمای tenant-safe مدیریت کنید.</p>
          </div>
          <Link href="/" className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-primary">صفحه اصلی</Link>
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="تنظیمات مدرسه" description="اطلاعات مدرسه و وضعیت عملیاتی.">
            <Link href="/academics/school" className="button-primary">ویرایش تنظیمات</Link>
          </Panel>
          <Panel title="سال‌های تحصیلی" description="ایجاد، فعال‌سازی، بستن و بایگانی سال‌ها.">
            <Link href="/academics/years" className="button-primary">مدیریت سال‌ها</Link>
          </Panel>
          <Panel title="پایه‌ها و درس‌ها" description="کاتالوگ مدرسه برای ساختار کلاس‌ها.">
            <div className="flex gap-3"><Link href="/academics/catalog" className="button-primary">مدیریت کاتالوگ</Link></div>
          </Panel>
          <Panel title="کلاس‌ها و دبیران" description="ساخت کلاس و تخصیص دبیر از عضویت معتبر مدرسه.">
            <Link href="/academics/classrooms" className="button-primary">مدیریت کلاس‌ها</Link>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-3xl bg-surface p-6 shadow-sm ring-1 ring-border"><h2 className="text-xl font-black text-primary">{title}</h2><p className="mt-2 min-h-12 text-sm leading-7 text-muted">{description}</p><div className="mt-5">{children}</div></section>;
}
