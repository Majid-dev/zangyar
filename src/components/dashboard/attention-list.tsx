import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-dot";

const classes = [
  { name: "هفتم الف", teacher: "مریم احمدی", count: "۳ غیبت", status: "absent" as const },
  { name: "پنجم ب", teacher: "رضا کریمی", count: "۲ تأخیر", status: "late" as const },
  { name: "سوم ج", teacher: "سارا نادری", count: "تکمیل نشده", status: "pending" as const },
];

export function AttentionList() {
  return (
    <Panel className="lg:col-span-5">
      <SectionHeading eyebrow="نیازمند پیگیری" title="کلاس‌های امروز" description="مواردی که بهتر است پیش از پایان روز بررسی شوند." />
      <div className="mt-4 divide-y divide-border">
        {classes.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-primary">{item.name}</p>
              <p className="mt-1 truncate text-xs text-muted">{item.teacher} · {item.count}</p>
            </div>
            <StatusBadge status={item.status} />
          </div>
        ))}
      </div>
      <Button className="mt-5 w-full" variant="secondary" size="sm" type="button" disabled>
        <Link href="#classrooms" className="pointer-events-none">مشاهده همه کلاس‌ها</Link>
      </Button>
    </Panel>
  );
}
