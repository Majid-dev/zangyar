import { Panel, SectionHeading } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";

export function ActivityFeed({ date, pendingClassroomCount }: { date: string; pendingClassroomCount: number }) {
  const activities = [
    { title: pendingClassroomCount === 0 ? "ثبت حضور همه کلاس‌ها کامل شد" : `${pendingClassroomCount} کلاس در انتظار ثبت حضور است`, meta: date, tone: pendingClassroomCount === 0 ? "success" as const : "warning" as const, mark: pendingClassroomCount === 0 ? "✓" : "!" },
    { title: "فهرست دانش‌آموزان از ثبت‌نام‌های فعال خوانده شد", meta: "داده مدرسه", tone: "info" as const, mark: "↗" },
  ];
  return (
    <Panel>
      <SectionHeading title="آخرین فعالیت‌ها" action={<span className="text-xs text-muted">امروز</span>} />
      <div className="mt-5 space-y-4">
        {activities.map((activity) => (
          <div key={activity.title} className="flex items-start gap-3">
            <Badge tone={activity.tone} className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg p-0 text-sm">{activity.mark}</Badge>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-6 text-primary">{activity.title}</p>
              <p className="mt-0.5 text-xs text-muted">{activity.meta}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
