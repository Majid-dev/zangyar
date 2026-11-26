"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { ActionState } from "@/lib/actions/result";

import { setTeacherStatusAction } from "../actions";
import { MAXIMUM_WEEKLY_HOURS, MINIMUM_WEEKLY_HOURS, NO_ACTIVE_YEAR_MESSAGE } from "../hours";
import type { TeacherStatusAction } from "../status";

/**
 * The approval dialog: confirm the teacher and record their mandatory weekly hours.
 *
 * Approval and the obligation are one decision — an approved teacher with no
 * recorded hours cannot be put on a timetable, so approving without a figure would
 * immediately create a second task. The dialog therefore asks for the figure as
 * part of approving, and submits both in one request; the server writes them in one
 * transaction, so there is no window in which a teacher is approved and
 * unconfigured.
 *
 * Hours are approved against the school's active academic year, because that is
 * the year the obligation belongs to. When the school has no active year there is
 * nowhere to record the figure, so the dialog says exactly that and offers no
 * submit rather than failing after the fact.
 *
 * The same dialog serves the reactivation action, minus the hours field: the
 * obligation was recorded at approval and is still on file, and re-entering it
 * would invite an accidental change to a figure the admin did not come here to
 * edit. That is why the field's presence is driven by the action's
 * `requiresWeeklyHours` flag, which the server derived, rather than by the button.
 */
export function TeacherApprovalDialog({
  registrationId,
  teacherName,
  action,
  activeAcademicYearName,
  hasActiveAcademicYear,
}: {
  registrationId: string;
  teacherName: string;
  action: TeacherStatusAction;
  activeAcademicYearName: string | null;
  hasActiveAcademicYear: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionState<unknown>>(null);
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = `approve-teacher-title-${registrationId}`;
  const needsHours = action.requiresWeeklyHours;
  const blocked = needsHours && !hasActiveAcademicYear;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    setState(null);
    triggerRef.current?.focus();
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await setTeacherStatusAction(null, formData);
      setState(result);
      if (result.ok) {
        // The dialog stays open only long enough to close itself; the row and the
        // status badge come from the refreshed server render, not from this result.
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button ref={triggerRef} type="button" className={buttonClasses({ size: "sm", variant: action.tone })} onClick={() => setOpen(true)}>
        {action.label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <button type="button" aria-label="بستن پنجره" onClick={close} className="absolute inset-0 bg-foreground/40" />
          <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-[0_18px_44px_rgba(23,59,87,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <h2 id={titleId} className="text-base font-black text-primary">{action.label}</h2>
              <button type="button" aria-label="بستن" onClick={close} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-sage hover:text-primary">✕</button>
            </div>

            <p className="mt-3 text-sm leading-6 text-muted">
              {needsHours
                ? `با تأیید ${teacherName}، دسترسی او به منابع مدرسه فعال می‌شود و ساعت موظفی هفتگی‌اش ثبت می‌گردد. تا تعیین این ساعت، امکان تخصیص زنگ به او وجود ندارد.`
                : `دسترسی ${teacherName} دوباره فعال می‌شود. ساعت موظفی ثبت‌شده او بدون تغییر باقی می‌ماند.`}
            </p>

            {blocked ? (
              <p role="alert" className="mt-4 rounded-xl border border-warning/35 bg-warning/8 p-3 text-xs leading-6 text-primary">{NO_ACTIVE_YEAR_MESSAGE}</p>
            ) : (
              <form action={submit} className="mt-4 grid gap-4">
                <input type="hidden" name="registrationId" value={registrationId} />
                <input type="hidden" name="status" value={action.status} />
                {needsHours ? (
                  <Field label="ساعت موظفی هفتگی" name="requiredWeeklyHours" hint={activeAcademicYearName ?? undefined}>
                    <Input
                      autoFocus
                      name="requiredWeeklyHours"
                      type="number"
                      inputMode="numeric"
                      min={MINIMUM_WEEKLY_HOURS}
                      max={MAXIMUM_WEEKLY_HOURS}
                      required
                      dir="ltr"
                      className="text-start"
                      placeholder={`${MINIMUM_WEEKLY_HOURS} تا ${MAXIMUM_WEEKLY_HOURS}`}
                    />
                  </Field>
                ) : null}

                {state && !state.ok ? (
                  <p role="alert" className="rounded-xl border border-danger/30 bg-danger/8 p-3 text-xs leading-6 text-danger">{state.message}</p>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button type="button" className={buttonClasses({ size: "sm", variant: "ghost" })} onClick={close}>انصراف</button>
                  <button type="submit" disabled={isPending} className={buttonClasses({ size: "sm", variant: action.tone })}>
                    {isPending ? "در حال ثبت…" : action.label}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
