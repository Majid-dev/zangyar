import { Panel, SectionHeading } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-dot";

const breakdown = [
  { label: "حاضر", value: 286, total: 312, status: "present" as const, color: "bg-success" },
  { label: "غایب", value: 14, total: 312, status: "absent" as const, color: "bg-danger" },
  { label: "تأخیر", value: 8, total: 312, status: "late" as const, color: "bg-warning" },
  { label: "موجه", value: 4, total: 312, status: "excused" as const, color: "bg-secondary" },
];

export function AttendanceSummary() {
  const total = breakdown.reduce((sum, item) => sum + item.value, 0);
  const present = breakdown[0].value;
  const presentPercent = Math.round((present / total) * 100);

  return (
    <Panel className="lg:col-span-7">
      <SectionHeading eyebrow="امروز · ۲۴ آبان ۱۴۰۴" title="وضعیت حضور مدرسه" description={`${total} دانش‌آموز در ${12} کلاس بررسی شده‌اند.`} action={<StatusBadge status="active" />} />
      <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center">
        <div>
          <div className="flex h-3 overflow-hidden rounded-full bg-sage" role="img" aria-label={`از ${total} دانش‌آموز، ${present} نفر حاضر هستند`}>
            {breakdown.map((item) => <div key={item.label} className={`${item.color} h-full first:rounded-s-full last:rounded-e-full`} style={{ width: `${(item.value / total) * 100}%` }} title={`${item.label}: ${item.value}`} />)}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
            {breakdown.map((item) => (
              <div key={item.label}>
                <div className="flex items-center gap-2 text-xs text-muted"><span className={`size-2 rounded-full ${item.color}`} aria-hidden="true" />{item.label}</div>
                <p className="mt-1 text-lg font-black tabular-nums text-primary">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border-s border-border ps-5 text-center sm:text-start">
          <p className="text-xs font-bold text-muted">نرخ حضور</p>
          <p className="mt-1 text-4xl font-black tracking-tight text-primary tabular-nums">{presentPercent}<span className="text-xl">٪</span></p>
          <p className="mt-2 text-xs leading-5 text-muted">نسبت به هفته‌ی گذشته<br /><span className="font-bold text-success">۲٪ بهتر</span></p>
        </div>
      </div>
    </Panel>
  );
}
