"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import type { AttendanceView, AttendanceWorkspaceData } from "./attendance-workspace";
import { toPersianDigits } from "@/lib/jalali";

const numberFormat = new Intl.NumberFormat("fa-IR");

/** The one grid every filter field uses, so the four controls cannot drift apart. */
const FIELD_CLASS = "grid min-w-0 gap-2 text-xs font-bold text-primary";

const STATUS_OPTIONS = [
  { value: "PENDING", label: "در انتظار ثبت" },
  { value: "SUBMITTED", label: "ثبت‌شده" },
  { value: "MISSING", label: "ثبت‌نشده و گذشته از مهلت" },
  { value: "UPCOMING", label: "شروع‌نشده" },
] as const;

/**
 * The administrator's scope and filters: grade, class, period, and submission status.
 *
 * All four are the same control — a searchable picker — because they are the same kind
 * of question, and a bar where two fields are native selects and two are text inputs
 * reads as two different kinds of decision when it is one. The grade and the status
 * were selects; they are pickers now, which also brings them search and a consistent
 * height and focus ring.
 *
 * The filters are URL parameters, not component state, and this bar writes them with
 * `router.replace` — so a filtered view is a link an admin can send, the browser's
 * back button undoes a filter, and the server decides which occurrences match. The
 * list is therefore correct on first paint rather than after a client-side pass over
 * rows the server need not have sent.
 *
 * The grade is a scope rather than a narrowing, and it is deliberately a single
 * choice with no "all grades": a school's day is browsed a grade at a time, and an
 * option that meant "all of them" would make the class list ambiguous the moment two
 * grades hold a class called "اول". It is the one picker with no clear option, and it
 * is not part of the clear action either, for the same reason — clearing filters
 * returns to the first class of the grade you are in, not to a school-wide view that
 * does not exist.
 *
 * The class and period filters combine by intersection with the status, so "period
 * three of this class" is expressible and so is "everything still pending in this
 * class". The clear action appears only once something is set, because a reset button
 * that does nothing is noise on the common case.
 *
 * The date is deliberately not a control here. It is a separate, larger decision —
 * which day the register is for — and it is reached from the schedule strip and the
 * date chip rather than from a bar whose job is narrowing one day.
 */
export function AttendanceFilterBar({ workspace, view }: { workspace: AttendanceWorkspaceData; view: AttendanceView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const classroomId = searchParams.get("classroomId") ?? "";
  const periodId = searchParams.get("periodId") ?? "";
  const submissionStatus = searchParams.get("submissionStatus") ?? "";
  const hasFilters = Boolean(classroomId || periodId || submissionStatus);
  const hiddenCount = workspace.totalSlotCount - workspace.slots.length;

  /**
   * Push a change into the query string.
   *
   * Choosing a class also clears the period, because the two name a register together:
   * a period id left from another class would ask for an occurrence that class may not
   * meet on. The reverse is not done — picking a period keeps the class — since a
   * period is meaningful across classes and clearing the class would widen the result
   * just as the admin narrowed it.
   *
   * Every write drops `openSlotKey`, because the register that was open was open in the
   * list being replaced. It also leaves the `view` alone: a filter narrows within the
   * reading of the day the administrator chose, and switching readings is the toggle's
   * job rather than a side effect of narrowing.
   */
  function applyFilter(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("openSlotKey");
    startTransition(() => router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false }));
  }

  function clearFilters() {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["classroomId", "periodId", "submissionStatus", "openSlotKey"]) params.delete(key);
    startTransition(() => router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false }));
  }

  return (
    <Panel className="p-3 sm:p-4">
      {/* Four equal fields on one row at desktop width and two on a tablet, all built
          from the same grid, so no control is a different size or a different kind of
          thing from its neighbours. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={FIELD_CLASS}>
          <span>پایه</span>
          {/* No clear option: the scope is always exactly one grade. */}
          <SearchPicker
            label="پایه"
            value={workspace.gradeScopeId ?? ""}
            onChange={(value) => applyFilter({ gradeId: value || null, classroomId: null, periodId: null })}
            options={workspace.filterOptions.grades.map((grade) => ({ value: grade.id, label: grade.name }))}
          />
        </div>

        <div className={FIELD_CLASS}>
          <span>کلاس</span>
          <SearchPicker
            label="کلاس"
            value={classroomId}
            onChange={(value) => applyFilter({ classroomId: value || null, periodId: null })}
            options={workspace.filterOptions.classrooms.map((classroom) => ({ value: classroom.id, label: classroom.name }))}
            allLabel="همه کلاس‌های این پایه"
          />
        </div>

        <div className={FIELD_CLASS}>
          <span>زنگ</span>
          <SearchPicker
            label="زنگ"
            value={periodId}
            onChange={(value) => applyFilter({ periodId: value || null })}
            options={workspace.filterOptions.periods.map((period) => ({ value: period.id, label: `زنگ ${toPersianDigits(period.ordinal)}` }))}
            allLabel="همه زنگ‌ها"
          />
        </div>

        <div className={FIELD_CLASS}>
          <span>وضعیت ثبت</span>
          <SearchPicker
            label="وضعیت ثبت"
            value={submissionStatus}
            onChange={(value) => applyFilter({ submissionStatus: value || null })}
            options={[...STATUS_OPTIONS]}
            allLabel="همه وضعیت‌ها"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            disabled={isPending}
            className="min-h-9 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-primary transition-colors hover:border-secondary/40 hover:text-secondary disabled:opacity-60"
          >
            پاک کردن فیلترها
          </button>
        ) : null}
        {/* Saying what the filters hid is what stops "no periods scheduled" from being
            read as "I filtered them all away" — the two have the same empty list. The
            view's own suppression is explained by the schedule strip instead, because it
            is a property of the reading rather than of anything set here. */}
        {hasFilters && hiddenCount > 0 ? (
          <p className="text-[0.7rem] text-muted" aria-live="polite">
            {numberFormat.format(workspace.slots.length)} زنگ از {numberFormat.format(workspace.totalSlotCount)} زنگ این پایه نمایش داده می‌شود
            {view === "active" ? " (فقط زنگ‌های در حال برگزاری)" : ""}.
          </p>
        ) : null}
        {isPending ? <span className="text-xs font-bold text-secondary" role="status">در حال به‌روزرسانی…</span> : null}
      </div>
    </Panel>
  );
}

/**
 * The picker every filter is built from, with search and an optional clear option.
 *
 * It works for a list that may be long — a school can hold more classes than fit in a
 * native select comfortably, and typing is the fast path for the one an admin already
 * has in mind — and equally for a short one, which is why the grade and the status use
 * it too: one control in the bar rather than two kinds.
 *
 * `allLabel` is what makes the picker clearable. A caller that passes it gets a clear
 * option listed first, so clearing is the same gesture as choosing; a caller that does
 * not — the grade — gets a list of exactly its options, because a scope that could be
 * unset is a second meaning for one state rather than a choice. No option carries a
 * hint: the label is the whole description, which is what keeps four pickers in a row
 * the same height and the same weight.
 */
function SearchPicker({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** When given, a clear option with this label is offered first. */
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value) ?? null;
  const normalized = query.trim();
  const filtered = normalized.length === 0 ? options : options.filter((option) => option.label.includes(normalized));

  // The field says what it is currently doing rather than sitting empty: the chosen
  // label, or the clear option's name when nothing is chosen and clearing is possible.
  const displayValue = open ? query : selected?.label ?? allLabel ?? "";

  function choose(next: string) {
    onChange(next);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        aria-label={label}
        value={displayValue}
        placeholder={allLabel ?? label}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {open ? (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-[0_18px_44px_rgba(23,59,87,0.18)]" role="listbox" aria-label={label}>
          {allLabel ? (
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose("")}
              className={`block w-full truncate rounded-lg px-3 py-2 text-start text-sm transition ${value === "" ? "bg-secondary/10 font-bold text-secondary" : "font-normal text-primary hover:bg-sage/60"}`}
            >
              {allLabel}
            </button>
          ) : null}
          {filtered.length === 0 ? (
            <p className="p-3 text-xs font-normal text-muted">موردی با این نام پیدا نشد.</p>
          ) : filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option.value)}
              className={`block w-full truncate rounded-lg px-3 py-2 text-start text-sm transition ${option.value === value ? "bg-secondary/10 font-bold text-secondary" : "font-normal text-primary hover:bg-sage/60"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
