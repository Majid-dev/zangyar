import Link from "next/link";

import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";

const sections = [
  {
    href: "/academics/school",
    title: "تنظیمات مدرسه",
    description: "نام، منطقه زمانی و اطلاعات تماس مدرسه.",
  },
  {
    href: "/academics/years",
    title: "سال‌های تحصیلی",
    description: "ایجاد، فعال‌سازی، بستن و بایگانی سال‌ها.",
  },
  {
    href: "/academics/catalog",
    title: "پایه‌ها و درس‌ها",
    description: "کاتالوگ مدرسه برای ساختار کلاس‌ها.",
  },
  {
    href: "/academics/classrooms",
    title: "کلاس‌ها و دبیران",
    description: "ساخت کلاس و تخصیص دبیر از عضویت معتبر مدرسه.",
  },
];

export default async function AcademicsPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "ساختار آموزشی" }]}
        title="مدرسه و ساختار آموزشی"
        description="سال تحصیلی، پایه‌ها، درس‌ها و کلاس‌ها را در یک نما مدیریت کنید."
        action={<BackLink href="/dashboard">بازگشت به داشبورد</BackLink>}
      />
      <div className="mt-6 divide-y divide-border border-y border-border">
        {sections.map((section, index) => (
          <Link
            key={section.href}
            href={section.href}
            className="group grid gap-2 px-1 py-5 transition-colors hover:bg-sage/40 sm:grid-cols-[3rem_minmax(0,18rem)_minmax(0,1fr)_2rem] sm:items-center sm:gap-4 sm:px-3"
          >
            <span className="hidden text-xs font-black tabular-nums text-muted/60 sm:block" aria-hidden="true">{String(index + 1).padStart(2, "۰")}</span>
            <span className="text-base font-black text-primary group-hover:text-secondary">{section.title}</span>
            <span className="text-sm leading-7 text-muted">{section.description}</span>
            <span className="hidden text-lg text-muted transition-transform group-hover:-translate-x-1 sm:block" aria-hidden="true">←</span>
          </Link>
        ))}
      </div>
    </AppPage>
  );
}
