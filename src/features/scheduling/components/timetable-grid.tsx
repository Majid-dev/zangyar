"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ActionFeedback } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Panel, SectionHeading } from "@/components/ui/panel";
import type { ActionState } from "@/lib/actions/result";
import { toPersianDigits } from "@/lib/jalali";

import { assignTimetableHoursAction, clearTimetableHoursAction } from "../actions";
import { PERIOD_HOUR_LABELS, type PeriodHourIndex } from "../schema";
import { SCHOOL_WEEKDAY_LABELS } from "../week";

/** One hour's assignment, as the grid draws it. */
export type GridAssignment = {
  teacherMembershipId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
};

/** A teacher who may be assigned: one the school has recorded mandatory hours for. */
export type GridTeacher = {
  id: string;
  name: string;
  requiredWeeklyHours: number;
  /** Hours this teacher already holds across the school for this year. */
  assignedWeeklyHours: number;
  /** How many more hours they may be given. Never negative. */
  remainingHours: number;
};

export type TimetableGridData = {
  classroomId: string;
  classroomName: string;
  academicYearId: string;
  operatingDays: number[];
  periods: { id: string; ordinal: number; startTime: string; endTime: string }[];
  subjects: { id: string; name: string }[];
  teachers: GridTeacher[];
  /** Keyed by `day:periodId:hourIndex`. */
  assigned: Record<string, GridAssignment>;
  /**
   * `day:periodId:hourIndex` values each teacher already teaches in *another*
   * classroom, keyed by teacher id. Read from the whole school's timetable rather
   * than this class's, because a clash is only a clash when it is elsewhere.
   */
  teacherBusyElsewhere: Record<string, string[]>;
};

const hourKeys = [1, 2] as const;

function cellKey(dayOfWeek: number, periodId: string, hourIndex: number) {
  return `${dayOfWeek}:${periodId}:${hourIndex}`;
}

function clock(time: string) {
  return toPersianDigits(time.slice(0, 5));
}

/**
 * The weekly timetable grid, and the one form that fills it.
 *
 * Rows are the school's operating days and columns are its periods, each period
 * drawn as its two hours side by side, because that is the shape of the question an
 * admin is answering: what happens in this hour, on this day. Reading it as a list
 * would hide both the free hours and the clashes, which are the two things the page
 * exists to show.
 *
 * Assignment is deliberately two steps rather than a form per cell: select the
 * hours, then name the teacher and the lesson once and save. That is what makes a
 * full period, a single hour, and a period split between two teachers with two
 * different subjects all reachable from the same control — the first is both hours
 * of a period selected with one teacher and one subject, the second is one hour
 * selected, and the third is the form run twice with different values. Nothing
 * asks the admin to declare which case they are in, because the selection already
 * says.
 *
 * The grid shows each teacher's remaining hours as they are chosen, and refuses a
 * save that would exceed them before the request is sent. The server checks the
 * same limit against the database, which is the authority; this only spares the
 * admin a round trip to be told something the page already knows.
 */
export function TimetableGrid({ data }: { data: TimetableGridData }) {
  const router = useRouter();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [actionState, setActionState] = useState<ActionState<unknown>>(null);
  const [isPending, startTransition] = useTransition();

  const teacherById = useMemo(() => new Map(data.teachers.map((teacher) => [teacher.id, teacher])), [data.teachers]);
  const selectedTeacher = teacherId ? teacherById.get(teacherId) ?? null : null;
  const busyByTeacher = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [id, keys] of Object.entries(data.teacherBusyElsewhere)) map.set(id, new Set(keys));
    return map;
  }, [data.teacherBusyElsewhere]);

  /**
   * The hours this save would newly give the selected teacher.
   *
   * Cells that already hold this teacher's own assignment are not new hours, so a
   * re-save of an untouched cell does not read as an addition — without this, an
   * admin correcting the lesson of an hour they already held would be told they
   * had exceeded a limit they were within.
   */
  const gainedHours = useMemo(() => {
    if (!selectedTeacher) return 0;
    return [...selection].filter((key) => data.assigned[key]?.teacherMembershipId !== selectedTeacher.id).length;
  }, [selection, selectedTeacher, data.assigned]);

  const overLimit = Boolean(selectedTeacher) && gainedHours > (selectedTeacher?.remainingHours ?? 0);

  /**
   * Selected cells the chosen teacher already teaches in another classroom.
   *
   * A cell this teacher already holds in *this* class is not a conflict — the write
   * replaces it — so only the other classroom's hours count.
   */
  const conflicting = useMemo(() => {
    if (!selectedTeacher) return new Set<string>();
    const busy = busyByTeacher.get(selectedTeacher.id) ?? new Set<string>();
    return new Set([...selection].filter((key) => busy.has(key)));
  }, [selection, selectedTeacher, busyByTeacher]);

  /**
   * How many of the selected cells each teacher already owns.
   *
   * A teacher who is at their limit can still be picked when the selection contains
   * one of their own hours, because saving it replaces that hour rather than adding
   * one. Without this, a teacher who is exactly at their mandatory figure could never
   * have a lesson's subject corrected — the picker would simply not offer them.
   */
  const selectedOwnedByTeacher = useMemo(() => {
    const counts = new Map<string, number>();
    for (const key of selection) {
      const assignment = data.assigned[key];
      if (!assignment) continue;
      counts.set(assignment.teacherMembershipId, (counts.get(assignment.teacherMembershipId) ?? 0) + 1);
    }
    return counts;
  }, [selection, data.assigned]);

  const canSave = selection.size > 0 && Boolean(selectedTeacher) && Boolean(subjectId) && !overLimit && conflicting.size === 0 && !isPending;

  function toggle(key: string) {
    setActionState(null);
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Selecting a joined full period means both of its hours, not the cell drawn over them. */
  function toggleAll(keys: string[]) {
    setActionState(null);
    setSelection((current) => {
      const next = new Set(current);
      const allSelected = keys.every((key) => next.has(key));
      for (const key of keys) {
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  function save() {
    if (!selectedTeacher || !subjectId) return;
    setActionState(null);
    startTransition(async () => {
      const result = await assignTimetableHoursAction({
        academicYearId: data.academicYearId,
        classroomId: data.classroomId,
        subjectId,
        teacherMembershipId: selectedTeacher.id,
        hours: [...selection].map(parseCellKey),
      });
      setActionState(result);
      if (result.ok) {
        setSelection(new Set());
        router.refresh();
      }
    });
  }

  function clearHours() {
    setActionState(null);
    startTransition(async () => {
      const result = await clearTimetableHoursAction({ classroomId: data.classroomId, hours: [...selection].map(parseCellKey) });
      setActionState(result);
      if (result.ok) {
        setSelection(new Set());
        router.refresh();
      }
    });
  }

  const assignedCount = Object.keys(data.assigned).length;
  const totalHours = data.operatingDays.length * data.periods.length * 2;

  return (
    <div className="space-y-4">
      <Panel className="overflow-hidden p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-4 sm:p-5">
          <SectionHeading
            eyebrow={`${toPersianDigits(assignedCount)} از ${toPersianDigits(totalHours)} ساعت هفته برنامه‌ریزی شده`}
            title={data.classroomName}
            description="هر خانه یک ساعت است. خانه‌هایی که می‌خواهید پر کنید انتخاب کنید، سپس دبیر و درس را پایین همین صفحه تعیین کنید."
          />
          <div className="flex flex-wrap items-center gap-2">
            {selection.size > 0 ? (
              <>
                <Badge tone="info">{toPersianDigits(selection.size)} خانه انتخاب‌شده</Badge>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelection(new Set())}>لغو انتخاب</Button>
              </>
            ) : (
              <span className="text-xs text-muted">برای شروع، خانه‌های خالی را انتخاب کنید.</span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <caption className="sr-only">برنامه هفتگی {data.classroomName}</caption>
            <thead>
              <tr className="bg-sage/50 text-xs font-bold text-muted">
                <th scope="col" className="w-24 p-3 text-start">روز</th>
                {data.periods.map((period) => (
                  <th key={period.id} scope="col" colSpan={2} className="border-s border-border p-3 text-center">
                    <span className="block text-primary">زنگ {toPersianDigits(period.ordinal)}</span>
                    <span className="mt-1 block font-normal tabular-nums" dir="ltr">{clock(period.startTime)} – {clock(period.endTime)}</span>
                  </th>
                ))}
              </tr>
              {/* The hour band is what makes "which of the period's two hours is this"
                  readable at a glance, and it is the row the merged full-period cell
                  spans when a period is taught whole. */}
              <tr className="bg-sage/30 text-[0.7rem] font-bold text-muted">
                <th scope="col" className="p-2 text-start">ساعت</th>
                {data.periods.flatMap((period) => hourKeys.map((hour) => (
                  <th key={`${period.id}-${hour}`} scope="col" className="w-28 border-s border-border p-2 text-center font-normal">
                    {PERIOD_HOUR_LABELS[hour]}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {data.operatingDays.map((day) => (
                <tr key={day} className="border-t border-border">
                  <th scope="row" className="bg-sage/20 p-3 text-start align-middle text-xs font-bold text-primary">
                    {SCHOOL_WEEKDAY_LABELS[day]}
                  </th>
                  {data.periods.flatMap((period) => {
                    const first = data.assigned[cellKey(day, period.id, 1)] ?? null;
                    const second = data.assigned[cellKey(day, period.id, 2)] ?? null;
                    // The two hours are one lesson exactly when the same teacher
                    // teaches the same subject in both. That is what "a full period"
                    // means here, and it is why nothing has to record the choice.
                    const joined = Boolean(first && second
                      && first.teacherMembershipId === second.teacherMembershipId
                      && first.subjectId === second.subjectId);
                    const keys = [cellKey(day, period.id, 1), cellKey(day, period.id, 2)];

                    if (joined && first) {
                      return [
                        <td key={`${period.id}-joined`} colSpan={2} className="border-s border-border p-1.5 align-top">
                          <HourCell
                            assignment={first}
                            hourCount={2}
                            hourIndex={1}
                            selected={keys.every((key) => selection.has(key))}
                            conflicting={false}
                            partial={false}
                            onClick={() => toggleAll(keys)}
                          />
                        </td>,
                      ];
                    }

                    return [
                      renderHourCell({ day, periodId: period.id, hourIndex: 1, assignment: first, selection, conflicting, siblingAssigned: Boolean(second), onToggle: toggle }),
                      renderHourCell({ day, periodId: period.id, hourIndex: 2, assignment: second, selection, conflicting, siblingAssigned: Boolean(first), onToggle: toggle }),
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-sage/20 px-4 py-3 text-[0.7rem] text-muted sm:px-5">
          <Legend swatch="border-secondary/40 bg-secondary/10 text-secondary" label="برنامه‌ریزی‌شده" />
          <Legend swatch="border-warning/50 bg-warning/10 text-[#8b5a08]" label="نیمه‌برنامه‌ریزی‌شده (یک ساعت از دو ساعت زنگ)" />
          <Legend swatch="border-dashed border-border bg-surface" label="خالی" />
          <Legend swatch="border-danger/50 bg-danger/10 text-danger" label="تداخل دبیر انتخاب‌شده" />
        </div>
      </Panel>

      <AssignmentForm
        subjects={data.subjects}
        teachers={data.teachers}
        teacherId={teacherId}
        subjectId={subjectId}
        onTeacherChange={(value) => { setTeacherId(value); setActionState(null); }}
        onSubjectChange={(value) => { setSubjectId(value); setActionState(null); }}
        selectionSize={selection.size}
        gainedHours={gainedHours}
        overLimit={overLimit}
        conflictCount={conflicting.size}
        canSave={canSave}
        isPending={isPending}
        actionState={actionState}
        selectedOwnedByTeacher={selectedOwnedByTeacher}
        onSave={save}
        onClear={clearHours}
      />
    </div>
  );
}

function parseCellKey(key: string) {
  const [dayOfWeek, periodId, hourIndex] = key.split(":");
  return { dayOfWeek: Number(dayOfWeek), periodId, hourIndex: Number(hourIndex) };
}

/**
 * One hour of the grid.
 *
 * A joined cell is drawn as one block spanning both hours and says "دو ساعت", which
 * is what tells an admin that the period is taught whole rather than that two
 * identical lessons were entered by mistake. A single hour names *which* hour it is,
 * so a period whose second hour is taught and first is free reads as exactly that.
 *
 * `partial` marks a lone hour whose period's other hour is also free: the period is
 * only half-planned, and a distinct tone is what makes that visible while scanning,
 * since a dashed empty cell in the next column reads as "this hour is free" rather
 * than "this period is unfinished". Its cell is solid where a free hour's is dashed,
 * because the hour itself is in fact planned.
 */
function HourCell({
  assignment,
  hourCount,
  hourIndex,
  selected,
  conflicting,
  partial,
  onClick,
}: {
  assignment: GridAssignment | null;
  hourCount: number;
  hourIndex: PeriodHourIndex;
  selected: boolean;
  conflicting: boolean;
  partial: boolean;
  onClick: () => void;
}) {
  const state = conflicting
    ? "border-danger/50 bg-danger/10 text-danger"
    : assignment
      ? partial
        ? "border-warning/50 bg-warning/10 text-[#8b5a08]"
        : "border-secondary/40 bg-secondary/10 text-secondary"
      : "border-dashed border-border bg-surface text-muted hover:border-secondary/40 hover:bg-sage/40";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-16 w-full flex-col items-start justify-center gap-1 rounded-lg border p-2.5 text-start transition ${state} ${selected ? "ring-2 ring-focus ring-offset-1 ring-offset-[color:var(--surface)]" : ""}`}
    >
      {assignment ? (
        <>
          <span className="text-xs font-bold">{assignment.subjectName}</span>
          <span className="text-[0.7rem]">{assignment.teacherName}</span>
          <span className="text-[0.65rem] font-bold opacity-80">
            {hourCount === 2 ? "دو ساعت" : `${PERIOD_HOUR_LABELS[hourIndex]} · یک ساعت`}
          </span>
        </>
      ) : (
        <span className="self-center text-[0.7rem] font-bold">افزودن</span>
      )}
    </button>
  );
}

function renderHourCell({
  day,
  periodId,
  hourIndex,
  assignment,
  selection,
  conflicting,
  siblingAssigned,
  onToggle,
}: {
  day: number;
  periodId: string;
  hourIndex: 1 | 2;
  assignment: GridAssignment | null;
  selection: Set<string>;
  conflicting: Set<string>;
  siblingAssigned: boolean;
  onToggle: (key: string) => void;
}) {
  const key = cellKey(day, periodId, hourIndex);
  // Being "conflicting" is a property of the chosen teacher, not of the cell, so it
  // is only ever known once a teacher is selected — which is why the grid cannot
  // mark these before then and the legend explains the colour instead. "Partial" is
  // per period rather than per hour: one assigned hour whose partner is free.
  const partial = Boolean(assignment) && !siblingAssigned;
  return (
    <td key={key} className="border-s border-border p-1.5 align-top">
      <HourCell
        assignment={assignment}
        hourCount={1}
        hourIndex={hourIndex}
        selected={selection.has(key)}
        conflicting={conflicting.has(key)}
        partial={partial}
        onClick={() => onToggle(key)}
      />
    </td>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block size-4 rounded border ${swatch}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * The teacher and subject the selection is being given to.
 *
 * Both fields are searchable rather than plain selects, because a school's teacher
 * list and subject list are the two places where scrolling is slowest and typing is
 * fastest, and assignment is done many times in a row. The teacher list carries each
 * teacher's remaining hours, so the limit the server enforces is visible while the
 * admin is choosing rather than only on refusal.
 */
function AssignmentForm({
  subjects,
  teachers,
  teacherId,
  subjectId,
  onTeacherChange,
  onSubjectChange,
  selectionSize,
  gainedHours,
  overLimit,
  conflictCount,
  canSave,
  isPending,
  actionState,
  selectedOwnedByTeacher,
  onSave,
  onClear,
}: {
  subjects: { id: string; name: string }[];
  teachers: GridTeacher[];
  teacherId: string;
  subjectId: string;
  onTeacherChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  selectionSize: number;
  gainedHours: number;
  overLimit: boolean;
  conflictCount: number;
  canSave: boolean;
  isPending: boolean;
  actionState: ActionState<unknown>;
  selectedOwnedByTeacher: Map<string, number>;
  onSave: () => void;
  onClear: () => void;
}) {
  const selectedTeacher = teachers.find((teacher) => teacher.id === teacherId) ?? null;

  return (
    <Panel>
      <SectionHeading
        title="تخصیص دبیر و درس به خانه‌های انتخاب‌شده"
        description="یک دبیر و یک درس انتخاب کنید و ذخیره بزنید. برای تقسیم یک زنگ بین دو دبیر یا دو درس، هر ساعت را جدا انتخاب و ذخیره کنید."
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <SearchSelect
          label="دبیر"
          placeholder="جست‌وجوی نام دبیر…"
          emptyLabel="دبیری با این نام پیدا نشد."
          value={teacherId}
          onChange={onTeacherChange}
          options={teachers.map((teacher) => {
            // A teacher at their limit stays selectable when the selection already
            // contains hours of theirs, because saving those replaces them rather
            // than adding any — so the picker mirrors the write instead of refusing
            // a correction the server would accept.
            const ownedSelected = selectedOwnedByTeacher.get(teacher.id) ?? 0;
            const selectable = teacher.remainingHours > 0 || ownedSelected > 0;
            return {
              value: teacher.id,
              label: teacher.name,
              hint: teacher.remainingHours === 0
                ? `ساعت موظفی تکمیل · ${toPersianDigits(teacher.assignedWeeklyHours)} از ${toPersianDigits(teacher.requiredWeeklyHours)}`
                : `${toPersianDigits(teacher.remainingHours)} ساعت ظرفیت · ${toPersianDigits(teacher.assignedWeeklyHours)} از ${toPersianDigits(teacher.requiredWeeklyHours)}`,
              disabled: !selectable,
            };
          })}
        />
        <SearchSelect
          label="درس"
          placeholder="جست‌وجوی نام درس…"
          emptyLabel="درسی با این نام پیدا نشد."
          value={subjectId}
          onChange={onSubjectChange}
          options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={!canSave} aria-busy={isPending || undefined} onClick={onSave}>
            {isPending ? "در حال ذخیره…" : selectionSize > 0 ? `ذخیره ${toPersianDigits(selectionSize)} خانه` : "ذخیره"}
          </Button>
          <Button type="button" variant="ghost" disabled={selectionSize === 0 || isPending} onClick={onClear}>
            پاک کردن خانه‌ها
          </Button>
        </div>
      </div>

      {teachers.length === 0 ? (
        <p className="mt-4 rounded-xl border border-warning/35 bg-warning/8 p-3 text-xs leading-6 text-primary" role="status">
          هیچ دبیری ساعت موظفی هفتگی ندارد. تا زمانی که ساعت موظفی ثبت نشود، دبیر قابل تخصیص به برنامه نیست.
        </p>
      ) : null}

      {selectedTeacher ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-sage/50 p-3 text-xs">
          <span className="font-bold text-primary">{selectedTeacher.name}</span>
          <span className="text-muted">
            ساعت موظفی {toPersianDigits(selectedTeacher.requiredWeeklyHours)} · تخصیص‌یافته {toPersianDigits(selectedTeacher.assignedWeeklyHours)} · باقی‌مانده {toPersianDigits(selectedTeacher.remainingHours)}
          </span>
          {selectionSize > 0 ? (
            <Badge tone={overLimit ? "danger" : "neutral"}>
              {toPersianDigits(gainedHours)} ساعت جدید در این ذخیره
            </Badge>
          ) : null}
        </div>
      ) : null}

      {overLimit ? (
        <p className="mt-3 rounded-xl border border-danger/30 bg-danger/8 p-3 text-xs leading-6 text-danger" role="alert">
          با این انتخاب، ساعت هفتگی دبیر از ساعت موظفی او بیشتر می‌شود. چند خانه را بردارید یا دبیر دیگری انتخاب کنید.
        </p>
      ) : null}

      {conflictCount > 0 ? (
        <p className="mt-3 rounded-xl border border-danger/30 bg-danger/8 p-3 text-xs leading-6 text-danger" role="alert">
          دبیر انتخاب‌شده در {toPersianDigits(conflictCount)} خانه از این انتخاب، کلاس دیگری دارد. آن خانه‌ها با رنگ سرخ مشخص شده‌اند.
        </p>
      ) : null}

      {selectionSize === 0 && teachers.length > 0 ? (
        <p className="mt-4 text-xs leading-6 text-muted">
          برای تخصیص، ابتدا خانه‌های موردنظر را در جدول بالا انتخاب کنید.
        </p>
      ) : null}

      <ActionFeedback state={actionState} />
    </Panel>
  );
}

type SearchOption = { value: string; label: string; hint?: string; disabled?: boolean };

/**
 * A text field that filters a list, used for both pickers.
 *
 * A native select with two hundred teachers is a scroll, and these two fields are
 * the ones an admin touches on every single assignment, so typing has to be the
 * fast path. The list is always rendered (rather than only while focused) so the
 * current choice stays visible, and a disabled option still shows its reason — a
 * teacher at their limit is legible as "full" rather than silently missing.
 */
function SearchSelect({
  label,
  placeholder,
  emptyLabel,
  value,
  onChange,
  options,
}: {
  label: string;
  placeholder: string;
  emptyLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;
  const normalized = query.trim();
  const filtered = normalized.length === 0
    ? options
    : options.filter((option) => option.label.includes(normalized));

  return (
    <div className="grid gap-2 text-sm font-bold text-primary">
      <span className="text-sm">{label}</span>
      <div className="relative">
        <Input
          value={open ? query : selected?.label ?? ""}
          placeholder={selected ? selected.label : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          className="pe-10"
        />
        {selected && !open ? (
          <button
            type="button"
            aria-label={`پاک کردن ${label}`}
            onClick={() => { onChange(""); setQuery(""); }}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg px-2 text-xs text-muted hover:bg-sage hover:text-primary"
          >
            ✕
          </button>
        ) : null}

        {open ? (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-[0_18px_44px_rgba(23,59,87,0.18)]" role="listbox" aria-label={label}>
            {filtered.length === 0 ? (
              <p className="p-3 text-xs font-normal text-muted">{emptyLabel}</p>
            ) : filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                disabled={option.disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { onChange(option.value); setQuery(""); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm transition ${
                  option.disabled
                    ? "cursor-not-allowed text-muted/70"
                    : option.value === value
                      ? "bg-secondary/10 font-bold text-secondary"
                      : "font-normal text-primary hover:bg-sage/60"
                }`}
              >
                <span className="truncate">{option.label}</span>
                {option.hint ? <span className="shrink-0 text-[0.65rem] font-normal text-muted">{option.hint}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <span className="text-[0.65rem] font-normal text-muted">
        {options.length === 0 ? "موردی ثبت نشده است." : `${toPersianDigits(options.length)} گزینه`}
      </span>
    </div>
  );
}
