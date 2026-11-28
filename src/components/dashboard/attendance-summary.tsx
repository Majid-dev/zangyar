import { Panel, SectionHeading } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-dot";
import type { AttendanceSummary as AttendanceSummaryData } from "@/features/attendance/queries";

const statusMeta = [
  { key: "PRESENT", label: "حاضر", status: "present" as const, color: "bg-success" },
  { key: "ABSENT", label: "غایب", status: "absent" as const, color: "bg-danger" },
  { key: "LATE", label: "تأخیر", status: "late" as const, color: "bg-warning" },
  { key: "EXCUSED", label: "موجه", status: "excused" as const, color: "bg-secondary" },
] as const;

const numberFormat = new Intl.NumberFormat("fa-IR");

export function AttendanceSummary({ summary }: { summary: AttendanceSummaryData }) {
  const total = Object.values(summary.counts).reduce((sum, value) => sum + value, 0);
  const present = summary.counts.PRESENT;
  const presentPercent = total === 0 ? 0 : Math.round((present / total) * 100);

  return (
    <Panel className="lg:col-span-7">
      <SectionHeading eyebrow={`امروز · ${summary.date}`} title="وضعیت حضور مدرسه" description={`${numberFormat.format(summary.studentCount)} دانش‌آموز در ${numberFormat.format(summary.classroomCount)} کلاس؛ ${numberFormat.format(summary.periodCount)} زنگ امروز.`} action={<StatusBadge status={summary.pendingPeriodCount > 0 ? "pending" : "active"} />} />
      {/* The periods a teacher could take right now, and the ones whose window has
          closed unregistered. The second is the one that costs the school a phone
          call tomorrow, so it is stated as a task rather than folded into a count. */}
      {summary.overduePeriodCount > 0 ? (
        <p className="mt-4 rounded-xl border border-danger/25 bg-danger/8 p-3 text-xs leading-6 text-danger" role="status">
          {numberFormat.format(summary.overduePeriodCount)} زنگ بدون ثبت حضور از مهلت گذشته است. برای اصلاح، همان زنگ را از صفحه حضور و غیاب باز کنید.
        </p>
      ) : summary.openPeriodCount > 0 ? (
        <p className="mt-4 rounded-xl border border-success/25 bg-success/8 p-3 text-xs leading-6 text-success" role="status">
          {numberFormat.format(summary.openPeriodCount)} زنگ همین حالا قابل ثبت حضور است.
        </p>
      ) : null}
      {total === 0 ? <div className="mt-6 rounded-xl bg-sage/60 p-5 text-sm leading-7 text-muted">هنوز حضور و غیابی برای امروز ثبت نشده است.</div> : <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center">
        <div>
          <div className="flex h-3 overflow-hidden rounded-full bg-sage" role="img" aria-label={`از ${numberFormat.format(total)} رکورد، ${numberFormat.format(present)} نفر حاضر هستند`}>
            {statusMeta.map((item) => <div key={item.key} className={`${item.color} h-full first:rounded-s-full last:rounded-e-full`} style={{ width: `${(summary.counts[item.key] / total) * 100}%` }} title={`${item.label}: ${numberFormat.format(summary.counts[item.key])}`} />)}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
            {statusMeta.map((item) => <div key={item.key}><div className="flex items-center gap-2 text-xs text-muted"><span className={`size-2 rounded-full ${item.color}`} aria-hidden="true" />{item.label}</div><p className="mt-1 text-lg font-black tabular-nums text-primary">{numberFormat.format(summary.counts[item.key])}</p></div>)}
          </div>
        </div>
        <div className="border-s border-border ps-5 text-center sm:text-start"><p className="text-xs font-bold text-muted">نرخ حضور</p><p className="mt-1 text-4xl font-black tracking-tight text-primary tabular-nums">{numberFormat.format(presentPercent)}<span className="text-xl">٪</span></p><p className="mt-2 text-xs leading-5 text-muted">{summary.pendingPeriodCount > 0 ? `${numberFormat.format(summary.pendingPeriodCount)} زنگ هنوز ثبت نشده` : "ثبت امروز کامل شده است"}</p></div>
      </div>}
    </Panel>
  );
}
