import Link from "next/link";

import { Panel, SectionHeading } from "@/components/ui/panel";

const actions = [
  { label: "ثبت حضور و غیاب", detail: "۱۲ کلاس منتظر ثبت", href: "/attendance", variant: "primary" as const },
  { label: "افزودن دانش‌آموز", detail: "ثبت یک دانش‌آموز جدید", href: "/students", variant: "secondary" as const },
];

export function QuickActions() {
  return (
    <Panel>
      <SectionHeading title="اقدام بعدی" description="کارهای پرتکرار را از همین‌جا شروع کنید." />
      <div className="mt-5 grid gap-2">
        {actions.map((action) => (
          <Link key={action.label} href={action.href} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 py-3 text-start text-sm font-bold transition-colors ${action.variant === "primary" ? "bg-primary text-white hover:bg-primary/90" : "border border-secondary/25 bg-secondary/10 text-secondary hover:bg-secondary/15"}`}>
            <span><span className="block">{action.label}</span><span className="mt-0.5 block text-[11px] font-normal opacity-75">{action.detail}</span></span>
            <span aria-hidden="true">←</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
