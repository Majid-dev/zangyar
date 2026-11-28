"use client";

import { useCallback, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { ActionFeedback } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { submitAttendanceAction } from "@/features/attendance/actions";
import {
  ATTENDANCE_OCCURRENCE_LABELS,
  resolveAttendanceWindow,
  type AttendanceOccurrenceState,
} from "@/features/attendance/window";
import type { ActionState } from "@/lib/actions/result";
import type { SchoolRole } from "@/lib/auth/authorization-core";
import { toPersianDigits } from "@/lib/jalali";

import { AttendanceFilterBar } from "./attendance-filters";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
type WorkspaceStudent = {
  id: string;
  enrollmentId: string;
  name: string;
  code: string;
  savedStatus: AttendanceStatus | null;
  savedNote: string | null;
  adminEditedAt: string | null;
  adminEditedByName: string | null;
};
type WorkspaceSlot = {
  classroomId: string;
  classroomName: string;
  gradeId: string;
  gradeName: string;
  gradeSortOrder: number;
  /** One lesson name, or two when the period is split between two subjects. */
  subjectNames: string[];
  shiftName: string;
  periodId: string;
  periodLabel: string;
  periodOrdinal: number;
  startTime: string;
  endTime: string;
  teacherMembershipId: string;
  teacherName: string;
  nextWeekTeacherMembershipId: string | null;
  nextWeekTeacherName: string | null;
  rotates: boolean;
  academicWeekNumber: number;
  periodStartAt: string | Date;
  periodEndAt: string | Date;
  submissionDeadlineAt: string | Date;
  sessionId: string | null;
  sessionStatus: "OPEN" | "CLOSED" | null;
  sessionClosed: boolean;
};
/** The two readings of a day: what is in session now, and everything scheduled. */
export type AttendanceView = "active" | "day";
export type AttendanceWorkspaceData = {
  businessDate: string;
  /** The school's timezone, so a deadline is shown in the clock the school keeps. */
  timezone: string;
  /** The instant the server resolved this page, so the first paint and hydration agree on the time. */
  serverNow: string;
  slots: WorkspaceSlot[];
  slot: WorkspaceSlot | null;
  students: WorkspaceStudent[];
  recordedCount: number;
  /** The grades, classes, and periods the day offers, for the administrator's filter pickers. */
  filterOptions: { grades: { id: string; name: string }[]; classrooms: { id: string; name: string }[]; periods: { id: string; ordinal: number }[] };
  /** How many occurrences the chosen grade holds before the class, period, and status filters. */
  totalSlotCount: number;
  /** How many occurrences the whole day holds, for the "no classes in this grade" message. */
  daySlotCount: number;
  /** How many occurrences are in session right now, so the empty state can say when the next one starts. */
  activeSlotCount: number;
  /** The grade the workspace is scoped to; null for a teacher, whose scope is their own week. */
  gradeScopeId: string | null;
  /** True when the list was narrowed to the periods in session, which the empty state has to explain. */
  activeOnly: boolean;
};

const statusOptions: { value: AttendanceStatus; label: string; short: string; selected: string }[] = [
  { value: "PRESENT", label: "حاضر", short: "ح", selected: "border-success/40 bg-success/12 text-success" },
  { value: "ABSENT", label: "غایب", short: "غ", selected: "border-danger/40 bg-danger/12 text-danger" },
  { value: "LATE", label: "تأخیر", short: "ت", selected: "border-warning/50 bg-warning/15 text-[#8b5a08]" },
  { value: "EXCUSED", label: "موجه", short: "م", selected: "border-secondary/40 bg-secondary/12 text-secondary" },
];

/** How each occurrence state paints, and the swatch the legend uses for it. */
const stateTone: Record<AttendanceOccurrenceState, { badge: "success" | "warning" | "danger" | "info" | "neutral"; dot: string }> = {
  UPCOMING: { badge: "neutral", dot: "bg-muted" },
  OPEN: { badge: "success", dot: "bg-success" },
  GRACE: { badge: "warning", dot: "bg-warning" },
  EXPIRED: { badge: "danger", dot: "bg-danger" },
  SUBMITTED: { badge: "info", dot: "bg-secondary" },
  CLOSED: { badge: "neutral", dot: "bg-primary" },
};

const numberFormat = new Intl.NumberFormat("fa-IR");

/**
 * A ticking clock shared by every tile on the page.
 *
 * One interval serves the whole schedule rather than one per tile, and the cached
 * instant is what makes it safe to read: a snapshot that produced a fresh `Date`
 * on every call would change identity on every render and spin the component. The
 * cache is only replaced when the tick or a new subscriber replaces it.
 */
const pageClock = {
  current: new Date(0),
  listeners: new Set<() => void>(),
  timer: null as number | null,
  ensure() {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => {
      this.current = new Date();
      for (const listener of this.listeners) listener();
    }, 30_000);
  },
  stop() {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  },
};

/**
 * The current instant, refreshed while the page is open.
 *
 * A register left open through a period boundary has to turn from "قابل ثبت" to
 * "داخل مهلت" without a reload, which is the case this page exists for, so the time
 * has to tick.
 *
 * Reading it through `useSyncExternalStore` rather than an effect is what keeps the
 * first paint and the hydration paint in agreement: the server snapshot is the
 * instant the page was resolved with — passed down as a prop, because only the
 * server knows it — and the browser's own clock is adopted afterwards, on the commit
 * where hydration finishes. An occurrence sitting exactly on its bell or its deadline
 * is the one place a clock read twice would render two different answers, and this is
 * what stops it.
 */
function useNow(serverNowIso: string) {
  // Both snapshots are stable objects rather than freshly built dates: React compares
  // them by identity to decide whether anything changed, so a snapshot that allocated
  // on every call would report a change on every call and loop.
  const serverNow = useMemo(() => new Date(serverNowIso), [serverNowIso]);
  const subscribe = useCallback((onStoreChange: () => void) => {
    pageClock.current = new Date();
    pageClock.ensure();
    pageClock.listeners.add(onStoreChange);
    return () => {
      pageClock.listeners.delete(onStoreChange);
      if (pageClock.listeners.size === 0) pageClock.stop();
    };
  }, []);
  return useSyncExternalStore(subscribe, () => pageClock.current, () => serverNow);
}

function clock(time: string) {
  return toPersianDigits(time.slice(0, 5));
}

function timeOf(value: string | Date, timezone: string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("fa-IR", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

/**
 * Attendance for one period.
 *
 * The statuses are local state because they are chosen before anything is sent, but
 * the slot is not: selecting a different period navigates, so the server decides
 * what the period's roster, responsibility, and window are. The rows are reset by
 * remounting on the slot key rather than by an effect watching for a change, so a
 * half-filled previous period can never be submitted under the new period's id.
 *
 * Whether the register may be written is *not* decided here. The window is judged by
 * `resolveAttendanceWindow` — the same function the server judges the write with —
 * over the instants the query resolved, so a period drawn as submittable is one the
 * service accepts, and a permission refusal and a closed window produce the
 * sentences they deserve instead of one generic failure. The `now` it compares
 * against is read once per render from the browser clock; the server's own clock is
 * what ultimately decides, and this only spares a teacher the round trip of finding
 * out.
 */
export function AttendanceWorkspace({ workspace, role, view }: { workspace: AttendanceWorkspaceData; role: SchoolRole; view: AttendanceView }) {
  return (
    <AttendanceWorkspaceForm
      key={workspace.slot ? `${workspace.slot.classroomId}:${workspace.slot.periodId}` : "none"}
      workspace={workspace}
      role={role}
      view={view}
    />
  );
}

function AttendanceWorkspaceForm({ workspace, role, view }: { workspace: AttendanceWorkspaceData; role: SchoolRole; view: AttendanceView }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /**
   * The address of an open register.
   *
   * Built from the current query string rather than from scratch, because the filters
   * are not the card's to change: clicking a tile used to write them, and the list then
   * came back showing only the card that had just been clicked. Only `openSlotKey` is
   * written here, and the reading of the day is left as it is — which is why the query
   * puts the opened occurrence back in the list rather than widening the view, so the
   * toggle keeps saying what it says and the card is on screen to be selected.
   */
  const openHref = useCallback((slotKey: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("openSlotKey", slotKey);
    return `${pathname}?${params.toString()}`;
  }, [pathname, searchParams]);
  const [students, setStudents] = useState<WorkspaceStudent[]>(workspace.students);
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(workspace.students.map((student) => [student.enrollmentId, student.savedStatus ?? "PRESENT"])),
  );
  const [query, setQuery] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [actionState, setActionState] = useState<ActionState<unknown>>(null);
  const [isPending, startTransition] = useTransition();
  const now = useNow(workspace.serverNow);

  // Named `occurrence` rather than `window`: the latter would shadow the global, and
  // this value is a judgment about one period's occurrence anyway.
  const occurrence = useMemo(() => workspace.slot
    ? resolveAttendanceWindow({
      now,
      periodStartAt: new Date(workspace.slot.periodStartAt),
      periodEndAt: new Date(workspace.slot.periodEndAt),
      submissionDeadlineAt: new Date(workspace.slot.submissionDeadlineAt),
      hasSession: workspace.slot.sessionId !== null,
      sessionClosed: workspace.slot.sessionClosed,
      role,
    })
    : null, [workspace.slot, role, now]);

  const filtered = useMemo(
    () => students.filter((student) => student.name.includes(query) || student.code.includes(query)),
    [query, students],
  );
  const counts = useMemo(
    () => students.reduce<Record<AttendanceStatus, number>>(
      (result, student) => ({ ...result, [draft[student.enrollmentId]]: result[draft[student.enrollmentId]] + 1 }),
      { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 },
    ),
    [students, draft],
  );

  /**
   * Students whose chosen status differs from what is on record.
   *
   * What gets sent is the whole roster — the server writes one register per
   * occurrence, so a partial list would be a different statement — but the number
   * that matters to the teacher confirming is how many they are actually changing,
   * because that is what the parents of those children will hear about.
   *
   * On a period that has never been registered, every row is a decision rather than a
   * change: there is no earlier status to differ from, so counting these would tell
   * every teacher taking a register for the first time that they had changed the
   * whole class. The count is about edits, so it only exists where there is something
   * to edit.
   */
  const changedCount = useMemo(
    () => students.filter((student) => student.savedStatus !== null && student.savedStatus !== draft[student.enrollmentId]).length,
    [students, draft],
  );

  function setAll(status: AttendanceStatus) {
    setConfirmed(false);
    setDraft(Object.fromEntries(students.map((student) => [student.enrollmentId, status])));
  }
  function setStatus(enrollmentId: string, status: AttendanceStatus) {
    setConfirmed(false);
    setDraft((current) => ({ ...current, [enrollmentId]: status }));
  }

  function save() {
    if (!workspace.slot) return;
    setActionState(null);
    startTransition(async () => {
      const result = await submitAttendanceAction({
        classroomId: workspace.slot?.classroomId,
        periodId: workspace.slot?.periodId,
        businessDate: workspace.businessDate,
        records: students.map((student) => ({ enrollmentId: student.enrollmentId, status: draft[student.enrollmentId] })),
      });
      setActionState(result);
      // A successful save has become the record; folding it back into the rows is
      // what turns "ثبت امروز" into "قبلاً ثبت شده" without a reload, and clears the
      // change count so a second save is visibly a no-op rather than a re-submission
      // of the same edits.
      if (result.ok) {
        // The rows are updated from what the server says it stored rather than from
        // the draft, because for the admin-edit tag the two can differ: a status the
        // admin has just changed is tagged by the server, and a status they left alone
        // keeps whatever tag it already carried. Trusting the draft would clear a tag
        // on a row that was not re-edited and never raise one on a row that was.
        const savedByEnrollment = new Map(result.data.records.map((record) => [record.enrollmentId, record]));
        setStudents((current) => current.map((student) => {
          const stored = savedByEnrollment.get(student.enrollmentId);
          if (!stored) return student;
          return { ...student, savedStatus: stored.status, adminEditedAt: stored.adminEditedAt ?? student.adminEditedAt };
        }));
        setConfirmed(false);
      }
    });
  }

  // An empty list has three different causes and three different answers. Distinguishing
  // them is the difference between "your timetable is empty", "clear a filter", and
  // "nothing is in session right now" — which is the ordinary state of a school at
  // half past ten, not a fault to be diagnosed.
  if (workspace.slots.length === 0) {
    const empty = workspace.totalSlotCount === 0
      ? {
        title: workspace.daySlotCount === 0 ? "زنگی برای این روز برنامه‌ریزی نشده است" : "برای این پایه زنگی در برنامه نیست",
        description: workspace.daySlotCount === 0
          ? "برای این تاریخ، هیچ زنگی در برنامه هفتگی این حساب نیست. برنامه هفتگی کلاس‌ها را از بخش ساختار آموزشی تکمیل کنید."
          : "این روز زنگ دارد، اما هیچ کلاسی از پایه انتخاب‌شده در آن نیست. پایه دیگری را انتخاب کنید.",
      }
      : workspace.activeOnly && workspace.activeSlotCount === 0
        ? {
          title: "در این لحظه کلاسی در حال برگزاری نیست",
          description: `زنگ‌های این پایه امروز فعال نیستند. برای دیدن کل برنامه امروز، نمایش «کل برنامه امروز» را انتخاب کنید.`,
        }
        : {
          title: "هیچ زنگی با این فیلترها هم‌خوان نیست",
          description: `این پایه ${numberFormat.format(workspace.totalSlotCount)} زنگ دارد، اما هیچ‌کدام با فیلترهای انتخاب‌شده هم‌خوان نیست. فیلترها را پاک کنید یا آن‌ها را تغییر دهید.`,
        };
    return (
      <div className="space-y-4">
        {role === "SCHOOL_ADMIN" ? <AttendanceFilterBar workspace={workspace} view={view} /> : null}
        <Panel>
          <SectionHeading
            title={empty.title}
            description={empty.description}
            // The empty state names the other reading of the day, so it has to offer it:
            // an empty screen that says "switch the view" and carries no control for
            // switching is a dead end, and this is the one state where the toggle is the
            // only thing to do.
            action={role === "SCHOOL_ADMIN" && workspace.activeOnly ? <ViewToggle activeOnly /> : undefined}
          />
        </Panel>
      </div>
    );
  }

  return (
    // `grid-cols-1` is not redundant with the `xl:` rule: a bare `grid` sizes its
    // implicit column to the widest content, so the schedule's strip of tiles would
    // push the page wider than the phone and scroll the whole layout sideways. A
    // single `minmax(0, 1fr)` column keeps the overflow inside the strip that owns it.
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="space-y-4">
        {/* The filter bar is the administrator's: a teacher's day is already their own
            occurrences, so there is nothing to narrow — and offering grade, class, and
            period pickers over a list they cannot see past would suggest otherwise. */}
        {role === "SCHOOL_ADMIN" ? <AttendanceFilterBar workspace={workspace} view={view} /> : null}
        <DailySchedule
          slots={workspace.slots}
          selected={workspace.slot}
          role={role}
          now={now}
          activeOnly={workspace.activeOnly}
          activeSlotCount={workspace.activeSlotCount}
          totalSlotCount={workspace.slots.length}
          openHref={openHref}
        />
        {workspace.slot && occurrence ? (
          <RegisterPanel
            slot={workspace.slot}
            occurrence={occurrence}
            students={students}
            filtered={filtered}
            draft={draft}
            changedCount={changedCount}
            query={query}
            onQueryChange={setQuery}
            onSetAll={setAll}
            onSetStatus={setStatus}
          />
        ) : null}
      </div>

      {workspace.slot && occurrence ? (
        <SubmissionAside
          slot={workspace.slot}
          occurrence={occurrence}
          role={role}
          counts={counts}
          changedCount={changedCount}
          studentCount={students.length}
          timezone={workspace.timezone}
          confirmed={confirmed}
          onConfirmChange={setConfirmed}
          onSave={save}
          isPending={isPending}
          actionState={actionState}
        />
      ) : null}
    </div>
  );
}

/**
 * The day's periods, as tiles, under a heading that says which reading of the day
 * is on screen.
 *
 * It is drawn as a horizontal run of tiles rather than a list because the question
 * is "where am I in the day" — the order of the periods is the schedule, and a
 * vertical list would say the same thing with a scroll to find the current one. Each
 * tile carries the state the same resolver gave the register panel, so the colour a
 * teacher sees here is the colour of the occurrence they will open.
 *
 * A tile's link carries the occurrence it opens and nothing else. It does not write
 * `classroomId` or `periodId`, because those are the administrator's filters and a
 * tile is not a filter control: opening a card is asking to look at one register, and
 * doing so used to silently narrow the list the administrator was browsing — and then
 * the list, having narrowed, no longer matched the card that was just opened. Which
 * register is open is carried by `openSlotKey`, which the server reads separately.
 */
function DailySchedule({
  slots,
  selected,
  role,
  now,
  activeOnly,
  activeSlotCount,
  totalSlotCount,
  openHref,
}: {
  slots: WorkspaceSlot[];
  selected: WorkspaceSlot | null;
  role: SchoolRole;
  now: Date;
  activeOnly: boolean;
  activeSlotCount: number;
  totalSlotCount: number;
  /** Builds the address of an open register, preserving whatever else the page carries. */
  openHref: (slotKey: string) => string;
}) {
  const hiddenByActive = activeOnly ? totalSlotCount - activeSlotCount : 0;
  return (
    <Panel className="p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold text-muted">{activeOnly ? "کلاس‌های در حال برگزاری" : "کل برنامه امروز"}</p>
          {role === "SCHOOL_ADMIN" ? <ViewToggle activeOnly={activeOnly} /> : null}
        </div>
        {/* The legend is what turns the tile colours into words: a teacher should not
            have to infer "green means I can submit" from a glance. */}
        <ul className="flex flex-wrap items-center gap-3 text-[0.7rem] text-muted">
          {(["OPEN", "GRACE", "UPCOMING", "EXPIRED", "SUBMITTED"] as const).map((state) => (
            <li key={state} className="inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${stateTone[state].dot}`} aria-hidden="true" />
              {ATTENDANCE_OCCURRENCE_LABELS[state]}
            </li>
          ))}
        </ul>
      </div>
      {hiddenByActive > 0 ? (
        <p className="mt-2 px-1 text-[0.7rem] text-muted" aria-live="polite">
          {numberFormat.format(hiddenByActive)} زنگ دیگر امروز خارج از زمان برگزاری است و در این نمایش نیست.
        </p>
      ) : null}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [contain:paint]">
        {slots.map((slot) => {
          // A period is keyed by classroom and period together: period ids are only
          // unique within the school's list, so two classes' period 3 are different
          // slots that must not be treated as the same row.
          const slotKey = `${slot.classroomId}:${slot.periodId}`;
          const isCurrent = slotKey === (selected ? `${selected.classroomId}:${selected.periodId}` : null);
          const state = resolveAttendanceWindow({
            now,
            periodStartAt: new Date(slot.periodStartAt),
            periodEndAt: new Date(slot.periodEndAt),
            submissionDeadlineAt: new Date(slot.submissionDeadlineAt),
            hasSession: slot.sessionId !== null,
            sessionClosed: slot.sessionClosed,
            role,
          }).state;
          return (
            <a
              key={slotKey}
              href={openHref(slotKey)}
              aria-current={isCurrent ? "true" : undefined}
              // Selection is carried by the border and a page-coloured surface, not by
              // recolouring the card's text. The status dot and the status word below
              // keep the tones `stateTone` gave them in every card state, because a
              // green dot that turns white when picked, or a red status that turns
              // amber, is a card that lies about the thing it exists to report. A
              // stronger `border-primary` ring and the darker `bg-paper` are enough to
              // say "this one is open", and they leave the semantic colours alone.
              className={`flex min-w-[11.5rem] shrink-0 flex-col gap-1 rounded-xl border-2 px-3 py-2.5 text-start transition ${
                isCurrent ? "border-primary bg-paper shadow-[0_6px_18px_rgba(23,59,87,0.10)]" : "border-border bg-surface hover:border-secondary/40 hover:bg-sage/40"
              }`}
            >
              <span className="flex items-center gap-2 text-[0.7rem] font-bold text-muted">
                <span className={`size-2 shrink-0 rounded-full ${stateTone[state].dot}`} aria-hidden="true" />
                زنگ {toPersianDigits(slot.periodOrdinal)} · {clock(slot.startTime)}
                <span className="sr-only">{ATTENDANCE_OCCURRENCE_LABELS[state]}</span>
              </span>
              <span className="truncate text-sm font-bold text-primary">{slot.classroomName}</span>
              <span className="truncate text-[0.7rem] text-muted">{slot.subjectNames.join(" / ")}</span>
              {/* A split period's owner changes weekly, so the tile says whose week it
                  is rather than leaving the teacher to infer it. */}
              <span className="truncate text-[0.7rem] text-muted">
                {slot.rotates ? `${slot.teacherName} · هفته ${toPersianDigits(slot.academicWeekNumber)}` : slot.teacherName}
              </span>
              <span className={`mt-0.5 text-[0.7rem] font-bold ${state === "OPEN" || state === "GRACE" ? "text-success" : state === "EXPIRED" ? "text-danger" : "text-muted"}`}>
                {ATTENDANCE_OCCURRENCE_LABELS[state]}
              </span>
            </a>
          );
        })}
      </div>
    </Panel>
  );
}

/**
 * The two readings of the day, as a pair of links.
 *
 * Links rather than a button with local state, because which reading is on screen is
 * part of the URL: the server decides which occurrences are in session, and an
 * administrator who sends the page to a colleague should send the view they were
 * looking at. `active` is an explicit parameter rather than the absence of `view`, so
 * the two states are both addressable and neither is a default that a stale link can
 * accidentally fall back into.
 */
function ViewToggle({ activeOnly }: { activeOnly: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  function hrefFor(target: AttendanceView) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", target);
    // The view is not a filter, so switching it leaves the filters where they are —
    // except the open register, which must be re-resolved against the list it is
    // about to be drawn in rather than left pointing at a card the view has hidden.
    params.delete("openSlotKey");
    return `${pathname}?${params.toString()}`;
  }
  return (
    <div className="flex items-center gap-1 rounded-xl bg-sage p-0.5 text-[0.7rem] font-bold" role="group" aria-label="نمایش برنامه امروز">
      {([["active", "در حال برگزاری"], ["day", "کل برنامه امروز"]] as const).map(([value, label]) => (
        <Link
          key={value}
          href={hrefFor(value)}
          aria-current={(value === "active") === activeOnly ? "true" : undefined}
          className={`rounded-lg px-2.5 py-1 transition ${(value === "active") === activeOnly ? "bg-surface text-primary shadow-[0_1px_4px_rgba(23,59,87,0.10)]" : "text-muted hover:text-primary"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function RegisterPanel({
  slot,
  occurrence,
  students,
  filtered,
  draft,
  changedCount,
  query,
  onQueryChange,
  onSetAll,
  onSetStatus,
}: {
  slot: WorkspaceSlot;
  occurrence: { state: AttendanceOccurrenceState; canSubmit: boolean; withinGrace: boolean; blocker: string | null };
  students: WorkspaceStudent[];
  filtered: WorkspaceStudent[];
  draft: Record<string, AttendanceStatus>;
  changedCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  onSetAll: (status: AttendanceStatus) => void;
  onSetStatus: (enrollmentId: string, status: AttendanceStatus) => void;
}) {
  const locked = !occurrence.canSubmit;
  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            eyebrow={`${slot.shiftName} · زنگ ${toPersianDigits(slot.periodOrdinal)} (${clock(slot.startTime)} تا ${clock(slot.endTime)})`}
            title={`${slot.classroomName} — ${slot.subjectNames.join(" / ")}`}
            description={`${numberFormat.format(students.length)} دانش‌آموز`}
          />
          <Badge tone={stateTone[occurrence.state].badge}>
            <span className={`size-1.5 rounded-full ${stateTone[occurrence.state].dot}`} aria-hidden="true" />
            {ATTENDANCE_OCCURRENCE_LABELS[occurrence.state]}
          </Badge>
        </div>

        {/* A split period is registered by one teacher for the whole period,
            alternating weekly; saying whose week it is explains why the other
            teacher cannot submit it. */}
        {slot.rotates ? (
          <p className="mt-3 rounded-xl border border-secondary/25 bg-secondary/8 p-3 text-xs leading-6 text-primary" role="status">
            مسئول ثبت این زنگ در هفته {toPersianDigits(slot.academicWeekNumber)} سال تحصیلی: <span className="font-bold">{slot.teacherName}</span>
            {slot.nextWeekTeacherName ? <> — هفته آینده این زنگ با {slot.nextWeekTeacherName} است.</> : null}
          </p>
        ) : null}

        {/* The refusal is stated where the work is, in the words the server would
            use, so a teacher knows why the buttons are inert before pressing one. */}
        {occurrence.blocker ? (
          <p className="mt-3 rounded-xl border border-warning/35 bg-warning/8 p-3 text-xs leading-6 text-primary" role="status">
            {occurrence.blocker}
          </p>
        ) : null}
        {occurrence.withinGrace && !occurrence.blocker ? (
          <p className="mt-3 rounded-xl border border-warning/35 bg-warning/8 p-3 text-xs leading-6 text-primary" role="status">
            این زنگ تمام شده و ثبت آن داخل مهلت تعیین‌شده مدرسه است؛ پس از پایان مهلت فقط مدیر مدرسه می‌تواند آن را ثبت یا اصلاح کند.
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">جست‌وجوی دانش‌آموز</span>
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="جست‌وجوی نام یا کد دانش‌آموز"
              className="pe-10"
              disabled={locked}
            />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button type="button" size="sm" variant="secondary" disabled={locked} onClick={() => onSetAll("PRESENT")}>همه حاضر</Button>
            <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => onSetAll("ABSENT")}>همه غایب</Button>
          </div>
        </div>
        {changedCount > 0 && !locked ? (
          <p className="mt-3 text-xs font-bold text-secondary">{numberFormat.format(changedCount)} تغییر ثبت‌نشده نسبت به ثبت فعلی</p>
        ) : null}
      </div>

      <div className="hidden grid-cols-[minmax(0,1fr)_13rem] gap-3 bg-sage/50 px-5 py-2.5 text-xs font-bold text-muted sm:grid">
        <span>دانش‌آموز</span>
        <span>وضعیت حضور</span>
      </div>
      <div className="divide-y divide-border">
        {filtered.map((student, index) => {
          const chosen = draft[student.enrollmentId];
          // A change is only a change against a record that exists; on a period being
          // taken for the first time every row is a first decision, not an edit.
          const changed = student.savedStatus !== null && student.savedStatus !== chosen;
          return (
            <div key={student.id} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sage text-xs font-black text-primary tabular-nums">{toPersianDigits(index + 1)}</span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-primary">
                    <span className="truncate">{student.name}</span>
                    {/* A row the teacher has moved away from what is on record says so
                        on the row itself, so the change is visible in the place it was
                        made rather than only in a count at the bottom. */}
                    {changed ? <span className="shrink-0 rounded-full bg-secondary/12 px-2 py-0.5 text-[0.65rem] font-bold text-secondary">تغییر</span> : null}
                    {/* A status the school has changed is disclosed on the row it
                        applies to, so a teacher reading their own register sees that
                        the office has been there — the record alone cannot say it, and
                        the audit log is somewhere they would have to go looking. The
                        neutral tone keeps it distinct from the four status colours, so
                        it does not read as a fifth status. */}
                    {student.adminEditedAt ? (
                      <span
                        className="shrink-0 rounded-full border border-primary/20 bg-primary-soft px-2 py-0.5 text-[0.65rem] font-bold text-primary"
                        title={student.adminEditedByName ? `آخرین اصلاح توسط مدیر: ${student.adminEditedByName}` : undefined}
                      >
                        اصلاح توسط مدیر
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    کد {student.code}
                    {student.savedStatus ? <> · ثبت‌شده: {statusOptions.find((option) => option.value === student.savedStatus)?.label}</> : null}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={`وضعیت حضور ${student.name}`}>
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={chosen === option.value}
                    disabled={locked}
                    onClick={() => onSetStatus(student.enrollmentId, option.value)}
                    className={`min-h-11 rounded-lg border text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${chosen === option.value ? option.selected : "border-border bg-surface text-muted hover:bg-sage/60"}`}
                  >
                    <span className="sm:hidden">{option.short}</span>
                    <span className="hidden sm:inline">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 ? <div className="p-10 text-center text-sm text-muted">دانش‌آموزی با این جست‌وجو پیدا نشد.</div> : null}
      </div>
    </Panel>
  );
}

/**
 * The confirmation gate and the save.
 *
 * Submitting a register sends a message to every guardian whose child's status is
 * not "present", which is not something to do on a stray tap, so the save is two
 * steps: the summary states what is about to be recorded — including how many rows
 * actually change — and the confirm button is the only thing that writes.
 *
 * The button is disabled when the window refuses, and the reason is on screen rather
 * than only in the error the server would return. Duplicate submissions are handled
 * on both sides: here by disabling while a save is in flight, and on the server by
 * upserting into the occurrence's single session, so two taps, two tabs, or a
 * retried request cannot produce two registers.
 */
function SubmissionAside({
  slot,
  occurrence,
  role,
  counts,
  changedCount,
  studentCount,
  timezone,
  confirmed,
  onConfirmChange,
  onSave,
  isPending,
  actionState,
}: {
  slot: WorkspaceSlot;
  occurrence: { state: AttendanceOccurrenceState; canSubmit: boolean; withinGrace: boolean; blocker: string | null };
  role: SchoolRole;
  counts: Record<AttendanceStatus, number>;
  changedCount: number;
  studentCount: number;
  timezone: string;
  confirmed: boolean;
  onConfirmChange: (value: boolean) => void;
  onSave: () => void;
  isPending: boolean;
  actionState: ActionState<unknown>;
}) {
  const alreadyRecorded = slot.sessionId !== null;
  return (
    <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
      <Panel>
        <SectionHeading
          title="خلاصه ثبت"
          description={alreadyRecorded ? "این زنگ قبلاً ثبت شده و این خلاصه، ویرایش بعدی را نشان می‌دهد." : "وضعیت انتخاب‌شده برای دانش‌آموزان این زنگ."}
        />
        <div className="mt-5 grid grid-cols-2 gap-2">
          {statusOptions.map((option) => (
            <div key={option.value} className="rounded-xl bg-sage/60 p-3">
              <p className="text-xs text-muted">{option.label}</p>
              <p className="mt-1 text-xl font-black tabular-nums text-primary">{numberFormat.format(counts[option.value])}</p>
            </div>
          ))}
        </div>

        <dl className="mt-4 grid gap-2 border-t border-border pt-4 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">دانش‌آموز در فهرست</dt>
            <dd className="font-bold tabular-nums text-primary">{numberFormat.format(studentCount)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{alreadyRecorded ? "تغییر نسبت به ثبت فعلی" : "در انتظار تغییر"}</dt>
            <dd className="font-bold tabular-nums text-primary">{numberFormat.format(changedCount)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">پایان مهلت</dt>
            <dd className="font-bold tabular-nums text-primary">{timeOf(slot.submissionDeadlineAt, timezone)}</dd>
          </div>
        </dl>

        <ActionFeedback state={actionState} />

        {occurrence.blocker ? (
          <p className="mt-4 rounded-xl border border-warning/35 bg-warning/8 p-3 text-xs leading-6 text-primary" role="status">{occurrence.blocker}</p>
        ) : confirmed ? (
          <div className="mt-4 grid gap-3 rounded-xl border border-secondary/25 bg-secondary/8 p-3">
            <p className="text-xs leading-6 text-primary">
              {alreadyRecorded ? "ویرایش" : "ثبت"} حضور و غیاب <span className="font-bold">{slot.classroomName}</span> برای زنگ {toPersianDigits(slot.periodOrdinal)}.
              {/* A first register has no "current" to differ from, so the sentence
                  describes what is being recorded rather than a comparison it cannot
                  make. */}
              {!alreadyRecorded
                ? <> وضعیت {numberFormat.format(counts.PRESENT)} حاضر و {numberFormat.format(counts.ABSENT + counts.LATE + counts.EXCUSED)} غیرحاضر ثبت می‌شود.</>
                : changedCount > 0
                  ? <> {numberFormat.format(changedCount)} وضعیت تغییر می‌کند.</>
                  : " تغییری نسبت به ثبت فعلی وجود ندارد."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={isPending} aria-busy={isPending || undefined} onClick={onSave}>
                {isPending ? "در حال ثبت…" : alreadyRecorded ? "تأیید ویرایش" : "تأیید و ثبت نهایی"}
              </Button>
              <button type="button" disabled={isPending} onClick={() => onConfirmChange(false)} className="text-xs font-bold text-muted hover:text-primary">انصراف</button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            className="mt-4 w-full"
            disabled={isPending || studentCount === 0 || !occurrence.canSubmit}
            onClick={() => onConfirmChange(true)}
          >
            {alreadyRecorded ? "ویرایش حضور و غیاب این زنگ" : "ثبت حضور و غیاب این زنگ"}
          </Button>
        )}

        {role === "SCHOOL_ADMIN" ? (
          <p className="mt-3 text-[0.7rem] leading-5 text-muted">
            مدیر مدرسه برای اصلاح ثبت، محدود به مهلت زنگ نیست؛ اصلاح‌ها در تاریخچه ثبت می‌شوند.
          </p>
        ) : null}
      </Panel>
    </aside>
  );
}
