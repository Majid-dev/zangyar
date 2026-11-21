"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  JALALI_MONTHS,
  JALALI_WEEKDAYS_SHORT,
  addJalaliMonths,
  formatJalaliDate,
  isoToJalali,
  jalaliMonthDays,
  jalaliToIso,
  jalaliWeekdayIndex,
  parseJalaliInput,
  toPersianDigits,
  todayIso,
  type JalaliDate,
} from "@/lib/jalali";

type JalaliDatePickerProps = {
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  describedBy?: string;
  timezone?: string;
  onValueChange?: (iso: string | null) => void;
};

function buildMonthGrid(view: JalaliDate) {
  const leading = jalaliWeekdayIndex(jalaliToIso(view.jy, view.jm, 1) ?? "1970-01-01");
  const length = jalaliMonthDays(view.jy, view.jm);
  const cells: ({ day: number; iso: string } | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= length; day += 1) {
    const iso = jalaliToIso(view.jy, view.jm, day);
    cells.push(iso ? { day, iso } : null);
  }
  return cells;
}

/**
 * Persian (Jalali) date picker.
 *
 * The visible control works in the Jalali calendar, but the value submitted with
 * the form is always a Gregorian ISO `YYYY-MM-DD` string in a hidden input, so
 * server schemas and the database keep a single, unambiguous date format.
 * Typing is accepted as well as clicking, and typed input is normalised through
 * the same `parseJalaliInput` boundary.
 */
export function JalaliDatePicker({
  name,
  defaultValue = null,
  required = false,
  disabled = false,
  placeholder = "۱۴۰۵/۰۸/۳۰",
  describedBy,
  timezone = "Asia/Tehran",
  onValueChange,
}: JalaliDatePickerProps) {
  const initial = isoToJalali(defaultValue);
  const [selectedIso, setSelectedIso] = useState<string | null>(initial ? defaultValue ?? null : null);
  const [view, setView] = useState<JalaliDate>(initial ?? isoToJalali(todayIso()) ?? { jy: 1405, jm: 1, jd: 1 });
  const [text, setText] = useState(initial ? formatJalaliDate(initial, "numeric") : "");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const todayIsoValue = useMemo(() => todayIso(timezone), [timezone]);
  const todayJalali = useMemo(() => isoToJalali(todayIsoValue), [todayIsoValue]);
  const cells = useMemo(() => buildMonthGrid(view), [view]);

  function commit(iso: string | null, jalali: JalaliDate | null) {
    setSelectedIso(iso);
    setText(jalali ? formatJalaliDate(jalali, "numeric") : "");
    setError(null);
    onValueChange?.(iso);
  }

  function selectDay(day: number, iso: string) {
    commit(iso, { ...view, jd: day });
    setOpen(false);
  }

  function clear() {
    commit(null, null);
    setOpen(false);
  }

  function commitTyped() {
    if (text.trim().length === 0) {
      commit(null, null);
      return;
    }
    const parsed = parseJalaliInput(text);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    const jalali = isoToJalali(parsed.iso);
    commit(parsed.iso, jalali);
    if (jalali) setView(jalali);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function moveFocus(offset: number) {
    const focusable = gridRef.current?.querySelectorAll<HTMLButtonElement>("button[data-day]");
    if (!focusable || focusable.length === 0) return;
    const activeIndex = Array.from(focusable).indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = activeIndex < 0 ? 0 : (activeIndex + offset + focusable.length) % focusable.length;
    focusable[nextIndex]?.focus();
  }

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-7);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(7);
    }
  }

  const selectedJalali = isoToJalali(selectedIso);

  return (
    <div className="relative" ref={containerRef}>
      {/* The single value the server ever sees: Gregorian ISO. */}
      <input type="hidden" name={name} value={selectedIso ?? ""} />

      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          dir="ltr"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          required={required && !selectedIso}
          value={text}
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          onBlur={commitTyped}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitTyped();
              setOpen(true);
            }
          }}
          onFocus={() => setOpen(true)}
          className="min-h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-start text-sm tabular-nums text-foreground outline-none transition placeholder:text-muted/70 focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={open ? "بستن تقویم" : "باز کردن تقویم"}
          onClick={() => setOpen((current) => !current)}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-base text-primary transition-colors hover:border-secondary/40 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span aria-hidden="true">▦</span>
        </button>
        {selectedIso || text.length > 0 ? (
          <button
            type="button"
            disabled={disabled}
            aria-label="پاک کردن تاریخ"
            onClick={clear}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-base text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden="true">✕</span>
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-xs font-normal text-danger" role="alert">{error}</p>
      ) : selectedJalali ? (
        <p className="mt-2 text-xs font-normal text-muted">برابر میلادی: <span dir="ltr" className="tabular-nums">{selectedIso}</span></p>
      ) : null}

      {open && !disabled ? (
        <div
          id={listboxId}
          role="dialog"
          aria-label="انتخاب تاریخ شمسی"
          className="absolute z-40 mt-2 w-[19rem] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-border bg-surface p-3 shadow-[0_18px_44px_rgba(23,59,87,0.16)]"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="ماه بعد"
              onClick={() => setView((current) => addJalaliMonths(current, 1))}
              className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-sage hover:text-primary"
            >
              <span aria-hidden="true">›</span>
            </button>
            <div className="flex items-center gap-2">
              <select
                aria-label="انتخاب سال"
                value={view.jy}
                onChange={(event) => setView((current) => ({ ...current, jy: Number(event.target.value), jd: 1 }))}
                className="min-h-9 rounded-lg border border-border bg-surface px-2 text-xs font-bold tabular-nums text-primary"
              >
                {Array.from({ length: 21 }, (_, index) => (todayJalali?.jy ?? view.jy) - 10 + index).map((year) => (
                  <option key={year} value={year}>{toPersianDigits(year)}</option>
                ))}
              </select>
              <span className="min-w-20 text-center text-sm font-black text-primary">{JALALI_MONTHS[view.jm - 1]}</span>
            </div>
            <button
              type="button"
              aria-label="ماه قبل"
              onClick={() => setView((current) => addJalaliMonths(current, -1))}
              className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-sage hover:text-primary"
            >
              <span aria-hidden="true">‹</span>
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {JALALI_WEEKDAYS_SHORT.map((label) => (
              <span key={label} className="py-1 text-center text-[10px] font-bold text-muted" aria-hidden="true">{label}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1" ref={gridRef} onKeyDown={handleGridKeyDown} role="grid">
            {cells.map((cell, index) => {
              if (!cell) return <span key={`empty-${index}`} aria-hidden="true" />;
              const isSelected = selectedIso === cell.iso;
              const isToday = todayJalaliValue(cell.iso, todayIsoValue);
              return (
                <button
                  key={cell.iso}
                  type="button"
                  data-day
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-label={formatJalaliDate({ ...view, jd: cell.day })}
                  onClick={() => selectDay(cell.day, cell.iso)}
                  className={`flex size-9 items-center justify-center rounded-lg text-xs font-bold tabular-nums transition-colors ${
                    isSelected
                      ? "bg-primary text-white"
                      : isToday
                        ? "bg-accent/20 text-[#8b5a08] hover:bg-accent/30"
                        : "text-primary hover:bg-sage"
                  }`}
                >
                  {toPersianDigits(cell.day)}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <button
              type="button"
              onClick={() => {
                const jalali = isoToJalali(todayIsoValue);
                if (jalali) {
                  commit(todayIsoValue, jalali);
                  setView(jalali);
                }
                setOpen(false);
              }}
              className="text-xs font-bold text-secondary hover:text-primary"
            >
              امروز
            </button>
            <button type="button" onClick={clear} className="text-xs font-bold text-muted hover:text-danger">پاک کردن</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function todayJalaliValue(iso: string, todayIsoValue: string) {
  return iso === todayIsoValue;
}
