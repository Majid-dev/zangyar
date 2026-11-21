import Link from "next/link";

import { Panel, SectionHeading } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-dot";
import type { DashboardAttentionItem } from "@/features/dashboard/queries";

export function AttentionList({ items }: { items: DashboardAttentionItem[] }) {
  return (
    <Panel className="lg:col-span-5">
      <SectionHeading eyebrow="نیازمند پیگیری" title="کلاس‌های امروز" description="وضعیت ثبت حضور کلاس‌های در دسترس این حساب." />
      <div className="mt-4 divide-y divide-border">
        {items.length === 0 ? <p className="py-3 text-sm text-muted">کلاس فعالی برای نمایش وجود ندارد.</p> : items.map((item) => <div key={item.classroomId} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-black text-primary">{item.name}</p><p className="mt-1 truncate text-xs text-muted">{item.detail}</p></div><StatusBadge status={item.status} /></div>)}
      </div>
      <Link href="/attendance" className="mt-5 flex min-h-9 w-full items-center justify-center rounded-xl border border-secondary/25 bg-secondary/10 text-xs font-bold text-secondary hover:bg-secondary/15">مشاهده حضور و غیاب</Link>
    </Panel>
  );
}
