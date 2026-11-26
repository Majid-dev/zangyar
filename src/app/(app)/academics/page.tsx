import Link from "next/link";

import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";

type AcademicSection = {
  href: string;
  title: string;
  description: string;
  icon: "school" | "calendar" | "catalog" | "classroom" | "shift" | "timetable" | "hours";
};

const sections: readonly AcademicSection[] = [
  {
    href: "/academics/school",
    title: "تنظیمات مدرسه",
    description: "نام، منطقه زمانی و اطلاعات تماس مدرسه.",
    icon: "school",
  },
  {
    href: "/academics/years",
    title: "سال‌های تحصیلی",
    description: "ایجاد، فعال‌سازی، بستن و بایگانی سال‌ها.",
    icon: "calendar",
  },
  {
    href: "/academics/catalog",
    title: "پایه‌ها و درس‌ها",
    description: "پایه‌ها و درس‌های مورد استفاده مدرسه را مدیریت کنید.",
    icon: "catalog",
  },
  {
    href: "/academics/classrooms",
    title: "کلاس‌ها",
    description: "کلاس بسازید و برنامه هفتگی هر کلاس را تکمیل کنید.",
    icon: "classroom",
  },
  {
    href: "/academics/shifts",
    title: "شیفت‌ها و زنگ‌ها",
    description: "روزهای فعالیت، تعداد زنگ‌ها و شیفت چرخشی مدرسه را تنظیم کنید.",
    icon: "shift",
  },
  {
    href: "/academics/timetable",
    title: "برنامه هفتگی",
    description: "درس و دبیر هر زنگ هفته را برای هر کلاس تعیین کنید.",
    icon: "timetable",
  },
  {
    href: "/academics/hours",
    title: "ساعت موظفی دبیران",
    description: "ساعت تخصیص‌یافته هر دبیر را با ساعت موظفی او مقایسه کنید.",
    icon: "hours",
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

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="بخش‌های ساختار آموزشی">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group relative flex min-h-56 flex-col items-center justify-center rounded-xl border border-border bg-surface px-5 pb-12 pt-9 text-center transition-colors duration-200 hover:border-secondary/50 hover:bg-primary-soft/30 focus-visible:border-focus"
          >
            <span className="flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary" aria-hidden="true">
              <AcademicIcon name={section.icon} />
            </span>
            <h2 className="mt-5 text-base font-bold text-primary transition-colors duration-200 group-hover:text-secondary">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{section.description}</p>
            {/* Independent of the centered content, in the trailing corner (left in RTL). */}
            <span className="absolute bottom-4 end-4 text-lg leading-none text-muted transition-colors duration-200 group-hover:text-secondary" aria-hidden="true">←</span>
          </Link>
        ))}
      </div>
    </AppPage>
  );
}

function AcademicIcon({ name }: { name: AcademicSection["icon"] }) {
  const common = { width: 30, height: 30, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  if (name === "school") {
    return <svg {...common}><path d="m3 10 9-6 9 6" /><path d="M5 9v10h14V9" /><path d="M9 19v-6h6v6" /><path d="M3 20h18" /></svg>;
  }
  if (name === "calendar") {
    return <svg {...common}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M16 2.5v4M8 2.5v4M3 9h18" /><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" /></svg>;
  }
  if (name === "catalog") {
    return <svg {...common}><path d="M4 4.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4z" /><path d="M20 4.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z" /><path d="M7 8h2M15 8h2M7 12h2M15 12h2" /></svg>;
  }
  if (name === "shift") {
    return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /><path d="M12 3.5v1.5M20.5 12H19M12 20.5V19M3.5 12H5" /></svg>;
  }
  if (name === "timetable") {
    return <svg {...common}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M9 9.5V20.5M15 9.5V20.5" /></svg>;
  }
  if (name === "hours") {
    return <svg {...common}><path d="M4 19.5h16" /><rect x="6" y="12" width="3" height="7.5" rx="1" /><rect x="11" y="8" width="3" height="11.5" rx="1" /><rect x="16" y="5" width="3" height="14.5" rx="1" /></svg>;
  }
  return <svg {...common}><path d="M3 19.5h18M5 19.5V8h14v11.5M8 8V5h8v3M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></svg>;
}
