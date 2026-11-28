import Link from "next/link";

import { Panel, SectionHeading } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import type { DashboardSlotSummary, TeacherOverview } from "@/features/dashboard/queries";
import { ATTENDANCE_OCCURRENCE_LABELS, type AttendanceOccurrenceState } from "@/features/attendance/window";
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

/** The state a teacher acts on first, so the day reads in the order it is worked. */
const STATE_ORDER: AttendanceOccurrenceState[] = ["OPEN", "GRACE", "EXPIRED", "UPCOMING", "SUBMITTED", "CLOSED"];

function clock(time: string) {
  return toPersianDigits(time.slice(0, 5));
}

/**
 * A teacher's day: the periods they owe, and what is left of them.
 *
 * This is a schedule and a to-do, not a dashboard of statistics. A teacher does not
 * need a percentage of a school they cannot see; they need to know which of their
 * periods still wants a register and in what order to take them, so the page opens
 * with the count of what is outstanding and then lists the periods themselves.
 *
 * Only the teacher's own occurrences appear — `getDashboardDataForContext` builds
 * this list from the slot read that already excludes any period the week has not
 * handed them — so there is no school-wide figure here to mistake for their own.
 */
export function TeacherDayPanel({ overview, slots, date }: { overview: TeacherOverview; slots: DashboardSlotSummary[]; date: string }) {
  const outstanding = overview.pendingPeriodCount + overview.missingPeriodCount;
  const ordered = [...slots].sort((left, right) =>
    STATE_ORDER.indexOf(left.state) - STATE_ORDER.indexOf(right.state)
    || left.startTime.localeCompare(right.startTime));

  return (
    <Panel className="lg:col-span-7">
      <SectionHeading
        eyebrow={`امروز · ${date}`}
        title={outstanding === 0 && slots.length > 0 ? "برنامه امروز شما" : "زنگ‌هایی که باید ثبت کنید"}
        description={
          slots.length === 0
            ? "برای امروز زنگی در برنامه شما نیست."
            : outstanding === 0
              ? `هر ${numberFormat.format(slots.length)} زنگ امروز شما ثبت شده است.`
              : `${numberFormat.format(outstanding)} زنگ از ${numberFormat.format(slots.length)} زنگ امروز شما هنوز ثبت نشده است.`
        }
        action={<Badge tone={overview.missingPeriodCount > 0 ? "danger" : outstanding > 0 ? "warning" : "success"}>
          {overview.missingPeriodCount > 0 ? `${numberFormat.format(overview.missingPeriodCount)} از مهلت گذشته` : outstanding > 0 ? `${numberFormat.format(outstanding)} باقی‌مانده` : "کامل"}
        </Badge>}
      />

      {slots.length === 0 ? (
        <p className="mt-6 rounded-xl bg-sage/60 p-5 text-sm leading-7 text-muted">
          برنامه هفتگی شما برای امروز زنگی ندارد. اگر انتظار دارید امروز کلاس داشته باشید، با مدیر مدرسه درباره برنامه هفتگی صحبت کنید.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-border">
          {ordered.map((slot) => (
            <li key={`${slot.classroomId}:${slot.periodId}`}>
              <Link
                // The register to open, named as such rather than as the filter pair:
                // a teacher has no filter bar, and passing `classroomId`/`periodId`
                // would make the attendance page treat the click as a narrowing of a
                // list they never had.
                href={`/attendance?date=${date}&view=day&openSlotKey=${encodeURIComponent(`${slot.classroomId}:${slot.periodId}`)}`}
                className="flex items-center justify-between gap-3 py-3.5 transition-colors hover:text-secondary"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-sage text-primary">
                    <span className="text-[0.6rem] font-bold leading-none">زنگ</span>
                    <span className="text-sm font-black tabular-nums leading-tight">{toPersianDigits(slot.periodOrdinal)}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-primary">{slot.classroomName}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {slot.subjectNames.join(" / ")} · {clock(slot.startTime)} تا {clock(slot.endTime)}
                    </span>
                    {/* A split period is registered by one teacher for the whole period
                        and alternates weekly, so saying whose week it is explains why
                        the other teacher cannot take it. */}
                    {slot.rotates && slot.nextWeekTeacherName ? (
                      <span className="mt-0.5 block truncate text-[0.7rem] text-muted">
                        این هفته با شما · هفته آینده با {slot.nextWeekTeacherName}
                      </span>
                    ) : null}
                  </span>
                </span>
                <Badge tone={stateTone[slot.state]}>{ATTENDANCE_OCCURRENCE_LABELS[slot.state]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * A teacher's own figures, each over the classes and periods they hold.
 *
 * Four numbers, all of them things a teacher can act on: the registers they owe today,
 * the ones already taken, the ones they have missed, and the classes and students they
 * are responsible for. None of them is a school-wide total, and none is a ranking —
 * there is deliberately no comparison with other teachers, because a teacher has no
 * decision to make from one.
 */
export function TeacherSummaryPanel({ overview }: { overview: TeacherOverview }) {
  return (
    <Panel className="lg:col-span-5">
      <SectionHeading eyebrow="وضعیت شما" title="جمع‌بندی امروز" />
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-sage/60 p-4">
          <p className="text-xs text-muted">زنگ‌های امروز شما</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-primary">{numberFormat.format(overview.assignedPeriodCount)}</p>
        </div>
        <div className="rounded-xl bg-sage/60 p-4">
          <p className="text-xs text-muted">ثبت‌شده</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-secondary">{numberFormat.format(overview.submittedPeriodCount)}</p>
        </div>
        <div className="rounded-xl bg-sage/60 p-4">
          <p className="text-xs text-muted">در انتظار ثبت</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-[#8b5a08]">{numberFormat.format(overview.pendingPeriodCount)}</p>
        </div>
        <div className="rounded-xl bg-sage/60 p-4">
          <p className="text-xs text-muted">بدون ثبت و گذشته از مهلت</p>
          <p className={`mt-1 text-2xl font-black tabular-nums ${overview.missingPeriodCount > 0 ? "text-danger" : "text-primary"}`}>{numberFormat.format(overview.missingPeriodCount)}</p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 border-t border-border pt-4 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">کلاس‌هایی که تدریس می‌کنید</dt>
          <dd className="font-bold tabular-nums text-primary">{numberFormat.format(overview.classroomCount)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">دانش‌آموزان این کلاس‌ها</dt>
          <dd className="font-bold tabular-nums text-primary">{numberFormat.format(overview.studentCount)}</dd>
        </div>
        {overview.rotatingPeriodCount > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">زنگ‌های چرخشی این هفته</dt>
            <dd className="font-bold tabular-nums text-primary">{numberFormat.format(overview.rotatingPeriodCount)}</dd>
          </div>
        ) : null}
      </dl>
    </Panel>
  );
}
