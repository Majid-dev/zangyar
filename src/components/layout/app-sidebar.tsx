import Link from "next/link";

const sections = [
  {
    label: "نمای کلی",
    items: [{ href: "/dashboard", label: "داشبورد", icon: "⌂" }],
  },
  {
    label: "مدیریت مدرسه",
    items: [
      { href: "/students", label: "دانش‌آموزان", icon: "◎" },
      { href: "/academics/classrooms", label: "کلاس‌ها", icon: "▦" },
      { href: "/academics", label: "ساختار آموزشی", icon: "⌘" },
    ],
  },
  {
    label: "عملیات روزانه",
    items: [
      { href: "/attendance", label: "حضور و غیاب", icon: "✓" },
      { href: "#activities", label: "فعالیت‌های کلاسی", icon: "✦" },
      { href: "#notifications", label: "اطلاع‌رسانی", icon: "◌" },
    ],
  },
];

export function AppSidebar({ active = "/dashboard" }: { active?: string }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-e border-border bg-surface px-4 py-5 lg:flex" aria-label="ناوبری اصلی">
      <Link href="/dashboard" className="flex items-center gap-3 px-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-black text-white">ز</span>
        <span>
          <span className="block text-base font-black tracking-tight text-primary">زنگ‌یار</span>
          <span className="block text-[11px] text-muted">مدرسه در جریان</span>
        </span>
      </Link>

      <nav className="mt-9 flex-1 space-y-7">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-3 text-[11px] font-bold text-muted">{section.label}</p>
            <div className="mt-2 space-y-1">
              {section.items.map((item) => {
                const isActive = item.href === active;
                const disabled = item.href.startsWith("#");
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    aria-disabled={disabled ? true : undefined}
                    tabIndex={disabled ? -1 : undefined}
                    className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors ${disabled ? "cursor-not-allowed text-muted/60" : isActive ? "bg-primary text-white" : "text-muted hover:bg-sage/60 hover:text-primary"}`}
                  >
                    <span className="flex size-6 items-center justify-center text-base" aria-hidden="true">{item.icon}</span>
                    {item.label}
                    {item.label === "حضور و غیاب" ? <span className="ms-auto size-2 rounded-full bg-accent" aria-label="نیازمند توجه" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="rounded-xl bg-sage/70 p-3">
        <p className="text-xs font-bold text-primary">مدرسه‌ی نمونه‌ی مهر</p>
        <p className="mt-1 text-[11px] text-muted">سال تحصیلی ۱۴۰۴–۱۴۰۵</p>
      </div>
    </aside>
  );
}
