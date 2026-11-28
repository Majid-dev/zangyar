"use client";

import { useEffect, useRef, useState } from "react";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { archiveClassroomAction, updateClassroomAction } from "../actions";
import { toPersianDigits } from "@/lib/jalali";

type GradeOption = { id: string; name: string };

const dialogCardClasses = "relative max-h-[85vh] w-full overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-[0_18px_44px_rgba(23,59,87,0.18)]";

/**
 * Closing a dialog on Escape, and restoring focus to the control that opened it.
 *
 * Shared by both dialogs here because both are the same interaction — a panel over the
 * page that the keyboard must be able to leave — and writing it twice is how one of
 * them ends up without the focus restore.
 */
function useDialog() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  return { open, setOpen, triggerRef, close };
}

/**
 * Edit a class in place.
 *
 * The form opens in a dialog over the list rather than on a page of its own, because
 * the edit is about one row in a list the administrator is reading, and navigating
 * away would lose the search term and the scroll position they were working from.
 *
 * The academic year is shown but not editable: a class's enrollments and timetable
 * rows are keyed to its year, so moving it would silently reassign both. It is stated
 * as text rather than offered as a disabled control, so it reads as a fact about the
 * class instead of a field that is broken.
 */
export function ClassroomEditAction({
  classroom,
  grades,
  academicYearName,
}: {
  classroom: { id: string; name: string; code: string; gradeId: string; capacity: number | null };
  grades: GradeOption[];
  academicYearName: string;
}) {
  const { open, setOpen, triggerRef, close } = useDialog();
  const titleId = `edit-class-title-${classroom.id}`;

  return (
    <>
      <button ref={triggerRef} type="button" className={buttonClasses({ size: "sm", variant: "secondary" })} onClick={() => setOpen(true)}>
        ویرایش
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <button type="button" aria-label="بستن پنجره‌ی ویرایش" onClick={close} className="absolute inset-0 bg-foreground/40" />
          <div className={dialogCardClasses}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={titleId} className="text-base font-black text-primary">ویرایش کلاس</h2>
                <p className="mt-1 text-xs text-muted">سال تحصیلی {academicYearName}</p>
              </div>
              <button type="button" aria-label="بستن" onClick={close} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sage hover:text-primary">✕</button>
            </div>

            <ActionForm action={updateClassroomAction} className="mt-5 grid gap-4" onSuccess={close}>
              <input type="hidden" name="classroomId" value={classroom.id} />
              <Field label="پایه" name="gradeId">
                <Select name="gradeId" required defaultValue={classroom.gradeId}>
                  {grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="کد کلاس" name="code"><Input name="code" defaultValue={classroom.code} required dir="ltr" className="text-start" /></Field>
                <Field label="ظرفیت" name="capacity" hint="اختیاری"><Input name="capacity" type="number" min="1" dir="ltr" className="text-start" defaultValue={classroom.capacity ?? ""} /></Field>
              </div>
              <Field label="نام کلاس" name="name"><Input name="name" defaultValue={classroom.name} required /></Field>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" className={buttonClasses({ size: "sm", variant: "ghost" })} onClick={close}>انصراف</button>
                <SubmitButton size="sm" pendingLabel="در حال ذخیره…">ذخیره تغییرات</SubmitButton>
              </div>
            </ActionForm>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Retire a class, behind a confirmation that says what is at stake.
 *
 * The dialog states what archiving does and, when it can, refuses before the request:
 * a class with students still enrolled cannot be archived, and saying so here is
 * better than a server refusal after the administrator has committed. The count is
 * passed in from the list's own read, so the sentence is about this class rather than
 * a generic warning.
 *
 * It says "archive" in so many words, because the button says "delete" and the two
 * would otherwise disagree: nothing is destroyed, the class leaves the operational
 * lists, and the enrollments, timetable, and attendance history that reference it stay
 * exactly where they are.
 */
export function ClassroomDeleteAction({
  classroomId,
  classroomName,
  enrolledCount,
}: {
  classroomId: string;
  classroomName: string;
  enrolledCount: number;
}) {
  const { open, setOpen, triggerRef, close } = useDialog();
  const titleId = `delete-class-title-${classroomId}`;
  const blocked = enrolledCount > 0;

  return (
    <>
      <button ref={triggerRef} type="button" className={buttonClasses({ size: "sm", variant: "danger" })} onClick={() => setOpen(true)}>
        حذف
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <button type="button" aria-label="بستن پنجره‌ی تأیید" onClick={close} className="absolute inset-0 bg-foreground/40" />
          <div className={dialogCardClasses}>
            <div className="flex items-start justify-between gap-4">
              <h2 id={titleId} className="text-base font-black text-primary">حذف کلاس</h2>
              <button type="button" aria-label="بستن" onClick={close} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sage hover:text-primary">✕</button>
            </div>

            <p className="mt-3 text-sm font-bold leading-6 text-primary">آیا از حذف کلاس «{classroomName}» اطمینان دارید؟</p>

            {blocked ? (
              <p className="mt-4 rounded-xl border border-warning/35 bg-warning/8 p-3 text-xs leading-6 text-primary" role="status">
                این کلاس {toPersianDigits(enrolledCount)} دانش‌آموز ثبت‌نام‌شده دارد و تا زمانی که ثبت‌نام آن‌ها بسته نشود قابل حذف نیست. ابتدا از صفحه‌ی دانش‌آموزان، ثبت‌نام آن‌ها را ببندید.
              </p>
            ) : (
              <p className="mt-4 rounded-xl border border-secondary/25 bg-secondary/8 p-3 text-xs leading-6 text-primary" role="status">
                کلاس بایگانی می‌شود، نه پاک: از فهرست کلاس‌ها، برنامه هفتگی و صفحه‌ی حضور و غیاب خارج می‌شود، اما اطلاعات دانش‌آموزان، برنامه‌ی هفتگی و سوابق حضور و غیاب آن محفوظ می‌مانند.
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button type="button" className={buttonClasses({ size: "sm", variant: "ghost" })} onClick={close}>انصراف</button>
              {blocked ? null : (
                <ActionForm action={archiveClassroomAction} onSuccess={close}>
                  <input type="hidden" name="itemId" value={classroomId} />
                  <SubmitButton size="sm" variant="danger" pendingLabel="در حال حذف…">حذف کلاس</SubmitButton>
                </ActionForm>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
