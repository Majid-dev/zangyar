"use client";

import { useEffect, useRef, useState } from "react";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { transitionAcademicYearAction } from "../actions";

const consequences = [
  "تمام کلاس‌های این سال تحصیلی از بخش کلاس‌های فعال خارج خواهند شد.",
  "تمام ثبت‌نام‌های فعال دانش‌آموزان در این سال تحصیلی به‌صورت خودکار بسته خواهند شد.",
  "ثبت‌نام جدید و ایجاد کلاس در این سال تحصیلی امکان‌پذیر نخواهد بود.",
  "اطلاعات کلاس‌ها، دانش‌آموزان، ثبت‌نام‌ها و سوابق تحصیلی حذف نخواهند شد و برای مراجعات بعدی محفوظ می‌مانند.",
  "وضعیت کلی پرونده دانش‌آموزان تغییر نخواهد کرد.",
] as const;

/**
 * Confirmation for closing an academic year.
 *
 * Closing also terminates every active enrollment in that year, so the dialog
 * states each consequence before the administrator commits. The operation only
 * runs on the explicit submit; the dialog itself performs no request.
 */
export function AcademicYearCloseAction({ academicYearId, academicYearName }: { academicYearId: string; academicYearName: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = `close-year-title-${academicYearId}`;

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
    triggerRef.current?.focus();
  }

  return (
    <>
      <button ref={triggerRef} type="button" className={buttonClasses({ size: "sm", variant: "ghost" })} onClick={() => setOpen(true)}>بستن سال</button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <button type="button" aria-label="بستن پنجره‌ی تأیید" onClick={close} className="absolute inset-0 bg-foreground/40" />
          <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-[0_18px_44px_rgba(23,59,87,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <h2 id={titleId} className="text-base font-black text-primary">بستن سال تحصیلی</h2>
              <button type="button" aria-label="بستن" onClick={close} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-sage hover:text-primary">✕</button>
            </div>

            <p className="mt-3 text-sm font-bold leading-6 text-primary">آیا از بستن سال تحصیلی «{academicYearName}» اطمینان دارید؟</p>
            <p className="mt-3 text-xs font-bold text-primary">با این عملیات:</p>
            <ul className="mt-2 list-disc space-y-1.5 pe-4 text-xs leading-6 text-muted">
              {consequences.map((consequence) => <li key={consequence}>{consequence}</li>)}
            </ul>

            <ActionForm action={transitionAcademicYearAction} className="mt-5">
              <input type="hidden" name="academicYearId" value={academicYearId} />
              <input type="hidden" name="status" value="CLOSED" />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" className={buttonClasses({ size: "sm", variant: "ghost" })} onClick={close}>انصراف</button>
                <SubmitButton size="sm" variant="danger" pendingLabel="در حال بستن…">بستن سال تحصیلی</SubmitButton>
              </div>
            </ActionForm>
          </div>
        </div>
      ) : null}
    </>
  );
}
