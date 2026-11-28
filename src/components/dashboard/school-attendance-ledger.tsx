import Link from "next/link";

import { Panel, SectionHeading } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import type { DashboardAttentionItem, SchoolOverview } from "@/features/dashboard/queries";
import {
  ATTENDANCE_OCCURRENCE_LABELS,
  type AttendanceOccurrenceState,
} from "@/features/attendance/window";
import { toPersianDigits } from "@/lib/jalali";

const numberFormat = new Intl.NumberFormat("fa-IR");

const stateTone: Record<AttendanceOccurrenceState, "success" | "warning" | "danger" | "info" | "neutral"> = {
  UPCOMING: "neutral",
  OPEN: "success",
  GRACE: "warning",
  EXPIRED: "danger",
  SUBMITTED: "info",
  CLOSED: "neutral",
};

/**
 * The school's day, as one ledger.
 *
 * Three figures and one bar, because the administrator's question is a single one —
 * "is today being recorded" — and the answer is the ratio of what has been registered
 * to what the day asked for. Three separate KPI tiles would say the same thing three
 * times and answer nothing; the bar is the answer, and the numbers beside it are the
 * labels on its parts. Every count is a real row count over this school's own
 * occurrences, resolved through the same window the register uses, so "missing" here
 * and "past its deadline" on the attendance page are the same occurrences.
 */
export function SchoolAttendanceLedger({ overview, date }: { overview: SchoolOverview; date: string }) {
  const total = overview.submittedCount + overview.pendingCount + overview.missingCount;
  const settledPercent = total === 0 ? 0 : Math.round((overview.submittedCount / total) * 100);
  const segments = [
    { key: "submitted", label: "ثبت‌شده", value: overview.submittedCount, color: "bg-secondary" },
    { key: "pending", label: "قابل ثبت", value: overview.pendingCount, color: "bg-warning" },
    { key: "missing", label: "بدون ثبت و گذشته از مهلت", value: overview.missingCount, color: "bg-danger" },
  ];

  return (
    <Panel className="lg:col-span-8">
      <SectionHeading
        eyebrow={`امروز · ${date}`}
        title="دفتر ثبت امروز"
        description={
          total === 0
            ? "برای امروز زنگی در برنامه مدرسه ثبت نشده است."
            : `${numberFormat.format(total)} زنگ امروز؛ ${numberFormat.format(overview.submittedCount)} ثبت‌شده و ${numberFormat.format(overview.pendingCount + overview.missingCount)} باقی‌مانده.`
        }
        action={<Badge tone={overview.missingCount > 0 ? "danger" : overview.pendingCount > 0 ? "warning" : "success"}>{numberFormat.format(settledPercent)}٪ ثبت‌شده</Badge>}
      />

      {total === 0 ? (
        <p className="mt-6 rounded-xl bg-sage/60 p-5 text-sm leading-7 text-muted">
          برنامه هفتگی این مدرسه برای امروز زنگی ندارد. اگر انتظار دارید امروز کلاس برگزار شود، برنامه هفتگی را از بخش ساختار آموزشی بررسی کنید.
        </p>
      ) : (
        <>
          <div className="mt-6 flex h-3.5 overflow-hidden rounded-full bg-sage" role="img" aria-label={`از ${numberFormat.format(total)} زنگ امروز، ${numberFormat.format(overview.submittedCount)} ثبت شده است`}>
            {segments.filter((segment) => segment.value > 0).map((segment) => (
              <div key={segment.key} className={`${segment.color} h-full first:rounded-s-full last:rounded-e-full`} style={{ width: `${(segment.value / total) * 100}%` }} title={`${segment.label}: ${numberFormat.format(segment.value)}`} />
            ))}
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            {segments.map((segment) => (
              <div key={segment.key}>
                <dt className="flex items-center gap-2 text-xs text-muted">
                  <span className={`size-2 rounded-full ${segment.color}`} aria-hidden="true" />
                  {segment.label}
                </dt>
                <dd className="mt-1 text-2xl font-black tabular-nums text-primary">{numberFormat.format(segment.value)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-5">
        {[
          { label: "کلاس فعال", value: overview.classroomCount },
          { label: "دانش‌آموز فعال", value: overview.studentCount },
          { label: "دبیر فعال", value: overview.teacherCount },
        ].map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-muted">{item.label}</dt>
            <dd className="mt-1 text-lg font-black tabular-nums text-primary">{numberFormat.format(item.value)}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/**
 * The occurrences still owed, as a list of places to go.
 *
 * These are the rows an administrator actually acts on, so each one is a link to the
 * period it names rather than a figure. The list is ordered by urgency — an occurrence
 * past its deadline first — because that is the order the work should be done in, and
 * each entry says which state it is in rather than relying on colour alone.
 */
export function SchoolAttentionList({ items, date }: { items: DashboardAttentionItem[]; date: string }) {
  return (
    <Panel className="lg:col-span-4">
      <SectionHeading eyebrow="نیازمند اقدام" title="زنگ‌های باقی‌مانده" />
      {items.length === 0 ? (
        <p className="mt-5 rounded-xl bg-sage/60 p-4 text-sm leading-7 text-muted">
          همه زنگ‌های امروز ثبت شده‌اند. برای امروز کاری باقی نمانده است.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {items.map((item) => (
            <li key={`${item.classroomId}:${item.periodId}`}>
              <Link
                // The occurrence is named as the register to open, not as a pair of
                // filters. Carrying `classroomId` and `periodId` would narrow the
                // attendance page's list to the card that was clicked, so a link that
                // says "open this register" would also throw away the day the
                // administrator was about to look at.
                href={`/attendance?date=${date}&view=day&openSlotKey=${encodeURIComponent(`${item.classroomId}:${item.periodId}`)}`}
                className="flex items-center justify-between gap-3 py-3 transition-colors first:pt-0 hover:text-secondary"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-primary">{item.classroomName}</span>
                  <span className="mt-1 block truncate text-xs text-muted">زنگ {toPersianDigits(item.periodOrdinal)} · {item.detail}</span>
                </span>
                <Badge tone={stateTone[item.state]}>{ATTENDANCE_OCCURRENCE_LABELS[item.state]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
