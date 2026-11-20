import { Panel, SectionHeading } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";

const activities = [
  { title: "حضور و غیاب کلاس هفتم الف ثبت شد", meta: "مریم احمدی · ۸:۲۴", tone: "success" as const, mark: "✓" },
  { title: "کلاس پنجم ب نیازمند بررسی است", meta: "رضا کریمی · ۸:۳۸", tone: "warning" as const, mark: "!" },
  { title: "سال تحصیلی جدید فعال شد", meta: "مدیریت مدرسه · دیروز", tone: "info" as const, mark: "↗" },
];

export function ActivityFeed() {
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
