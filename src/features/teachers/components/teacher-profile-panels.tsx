"use client";

import { useState } from "react";

import { ActionForm, ConfirmSubmitButton, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

import { toPersianDigits } from "@/lib/jalali";

import { deleteRegistrationAction, setTeacherWeeklyHoursAction, updateRegistrationMobileAction, updateTeacherAction } from "../actions";
import { MAXIMUM_WEEKLY_HOURS, MINIMUM_WEEKLY_HOURS } from "../hours";
import type { TeacherDetail } from "../queries";
import { TEACHER_DISPLAY_STATUS_LABELS, TEACHER_DISPLAY_STATUS_TONES } from "../status";
import { TeacherRowActions } from "./teacher-row-actions";

/**
 * A teacher record as the admin sees it.
 *
 * The panel adapts to how far the person has got: before registration there is
 * only a number to correct or delete; after registration there is a name to
 * review, a mandatory-hours figure to set, and an access decision to make. The
 * access decision itself is the shared row control, so this page cannot offer a
 * move the table would refuse, or the other way round.
 */
export function TeacherProfileCard({ teacher, hasActiveAcademicYear }: { teacher: TeacherDetail; hasActiveAcademicYear: boolean }) {
  const [editing, setEditing] = useState(false);
  const registered = teacher.registrationStatus === "CLAIMED";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">شماره همراه</p>
          <p className="mt-1 text-sm font-bold text-primary">{teacher.phoneNumber}</p>
        </div>
        <div>
          <p className="text-xs text-muted">نام و نام خانوادگی</p>
          <p className="mt-1 text-sm font-bold text-primary">
            {teacher.firstName && teacher.lastName ? `${teacher.firstName} ${teacher.lastName}` : <span className="text-muted">ثبت نشده</span>}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">کد پرسنلی</p>
          <p className="mt-1 text-sm font-bold text-primary">{teacher.personnelCode ?? "ثبت نشده"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">ساعت موظفی هفتگی</p>
          <p className="mt-1">
            {teacher.requiredWeeklyHours === null ? (
              <Badge tone="warning">تعیین نشده</Badge>
            ) : (
              <span className="text-sm font-bold text-primary tabular-nums">{toPersianDigits(String(teacher.requiredWeeklyHours))} ساعت</span>
            )}
            {teacher.academicYearName ? <span className="mt-1 block text-[11px] text-muted">سال تحصیلی {teacher.academicYearName}</span> : null}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">وضعیت</p>
          <p className="mt-1"><Badge tone={TEACHER_DISPLAY_STATUS_TONES[teacher.displayStatus]}>{TEACHER_DISPLAY_STATUS_LABELS[teacher.displayStatus]}</Badge></p>
        </div>
        <div>
          <p className="text-xs text-muted">تأیید شماره همراه</p>
          <p className="mt-1">
            <Badge tone={teacher.mobileVerified === null ? "neutral" : teacher.mobileVerified ? "success" : "warning"}>
              {teacher.mobileVerified === null ? "—" : teacher.mobileVerified ? "تأییدشده" : "تأییدنشده"}
            </Badge>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {registered ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>ویرایش اطلاعات دبیر</Button>
        ) : (
          <MobileCorrection teacher={teacher} />
        )}
      </div>

      {editing ? <TeacherEditForm teacher={teacher} onClose={() => setEditing(false)} /> : null}

      {registered ? <WeeklyHoursForm teacher={teacher} hasActiveAcademicYear={hasActiveAcademicYear} /> : null}

      {teacher.registrationStatus === "PENDING" ? <RegistrationDeletion teacher={teacher} /> : null}

      <AccessDecision teacher={teacher} hasActiveAcademicYear={hasActiveAcademicYear} />
    </div>
  );
}

/** Corrects the number while it is still unclaimed. */
function MobileCorrection({ teacher }: { teacher: TeacherDetail }) {
  const [editing, setEditing] = useState(false);

  if (!teacher.canEditMobile) return null;

  if (!editing) {
    return <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>تغییر شماره همراه</Button>;
  }

  return (
    <div className="w-full border-t border-border pt-4">
      <ActionForm action={updateRegistrationMobileAction} onSuccess={() => setEditing(false)} className="grid gap-3">
        <input type="hidden" name="registrationId" value={teacher.registrationId} />
        <Field label="شماره همراه تازه" name="mobile">
          <Input name="mobile" type="tel" inputMode="tel" dir="ltr" required placeholder="09120000000" className="text-start" />
        </Field>
        <p className="text-xs leading-6 text-muted">
          پیش از ثبت‌نام می‌توانید شماره را اصلاح کنید. پس از ثبت‌نام، شماره نام کاربری دبیر می‌شود و از این‌جا قابل تغییر نیست.
        </p>
        <div className="flex items-center gap-2">
          <SubmitButton size="sm" pendingLabel="در حال تغییر…">ذخیره</SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>بستن</Button>
        </div>
      </ActionForm>
    </div>
  );
}

function TeacherEditForm({ teacher, onClose }: { teacher: TeacherDetail; onClose: () => void }) {
  return (
    <ActionForm action={updateTeacherAction} onSuccess={onClose} className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
      <input type="hidden" name="registrationId" value={teacher.registrationId} />
      <Field label="نام" name="firstName"><Input name="firstName" defaultValue={teacher.firstName ?? ""} required /></Field>
      <Field label="نام خانوادگی" name="lastName"><Input name="lastName" defaultValue={teacher.lastName ?? ""} required /></Field>
      <Field label="کد پرسنلی" name="personnelCode" hint="اختیاری"><Input name="personnelCode" defaultValue={teacher.personnelCode ?? ""} dir="ltr" className="text-start" /></Field>
      <div className="flex items-center gap-2 self-end">
        <SubmitButton pendingLabel="در حال ذخیره…">ذخیره تغییرات</SubmitButton>
        <Button type="button" variant="ghost" onClick={onClose}>بستن</Button>
      </div>
      <p className="text-xs leading-6 text-muted sm:col-span-2">
        تغییر نام، نام حساب کاربری دبیر را هم به‌روزرسانی می‌کند تا فهرست و ورود او یکسان بمانند.
      </p>
    </ActionForm>
  );
}

/**
 * Deletes an authorized number outright.
 *
 * Offered only while the number is unclaimed, where the record is nothing but the
 * admin's own assertion about a number nobody owns — no account, membership, or
 * profile can be orphaned by removing it. Once the person registers, ending their
 * access is deactivation, not deletion, so this control disappears rather than
 * becoming dangerous.
 */
function RegistrationDeletion({ teacher }: { teacher: TeacherDetail }) {
  return (
    <div className="border-t border-border pt-4">
      <p className="text-xs font-bold text-muted">حذف شماره همراه</p>
      <p className="mt-1 text-xs leading-6 text-muted">
        اگر این شماره را اشتباه ثبت کرده‌اید یا دیگر لازم نیست، می‌توانید آن را حذف کنید. با حذف، این شماره از فهرست دبیران پاک می‌شود و بعداً می‌توانید دوباره آن را ثبت کنید.
      </p>
      <ActionForm action={deleteRegistrationAction} className="mt-3">
        <input type="hidden" name="registrationId" value={teacher.registrationId} />
        <ConfirmSubmitButton question="این شماره همراه برای همیشه از فهرست حذف شود؟" confirmLabel="حذف کن" variant="danger">
          حذف شماره همراه
        </ConfirmSubmitButton>
      </ActionForm>
    </div>
  );
}

/**
 * The teacher's mandatory weekly hours, and the only place they are edited.
 *
 * Shown for every registered teacher, not only for approved ones: the figure is
 * what approval will record, so an admin deciding whether to approve needs to see
 * whether one is already on file — and if a teacher was approved before the rule
 * existed, this is where the missing figure is filled in, which lifts the
 * scheduling block without touching their access.
 */
function WeeklyHoursForm({ teacher, hasActiveAcademicYear }: { teacher: TeacherDetail; hasActiveAcademicYear: boolean }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="border-t border-border pt-4">
        <p className="text-xs font-bold text-muted">ساعت موظفی هفتگی</p>
        <p className="mt-1 text-xs leading-6 text-muted">
          {teacher.requiredWeeklyHours === null
            ? "برای این دبیر ساعت موظفی تعیین نشده است؛ تا تعیین آن، امکان تخصیص زنگ وجود ندارد."
            : "ساعت تخصیص‌یافته هفتگی این دبیر از برنامه هفتگی خوانده می‌شود و با این عدد مقایسه می‌گردد."}
        </p>
        <div className="mt-3">
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
            {teacher.requiredWeeklyHours === null ? "تعیین ساعت موظفی" : "ویرایش ساعت موظفی"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border pt-4">
      {!hasActiveAcademicYear ? (
        <>
          <p className="text-xs font-bold text-muted">ساعت موظفی هفتگی</p>
          {/* Without an active year there is no year to record the obligation
              against, so the form explains that rather than failing on submit. */}
          <p role="alert" className="mt-2 rounded-xl border border-warning/35 bg-warning/8 p-3 text-xs leading-6 text-primary">
            برای ثبت ساعت موظفی، ابتدا یک سال تحصیلی فعال بسازید.
          </p>
        </>
      ) : (
        <ActionForm action={setTeacherWeeklyHoursAction} onSuccess={() => setEditing(false)} className="grid gap-3 sm:max-w-sm">
          <input type="hidden" name="registrationId" value={teacher.registrationId} />
          <Field
            label="ساعت موظفی هفتگی"
            name="requiredWeeklyHours"
            hint={teacher.academicYearName ?? undefined}
          >
            <Input
              name="requiredWeeklyHours"
              type="number"
              inputMode="numeric"
              min={MINIMUM_WEEKLY_HOURS}
              max={MAXIMUM_WEEKLY_HOURS}
              defaultValue={teacher.requiredWeeklyHours ?? ""}
              required
              dir="ltr"
              className="text-start"
            />
          </Field>
          <p className="text-xs leading-6 text-muted">
            زنگ‌های برنامه هفتگی این دبیر با این عدد مقایسه می‌شوند؛ زنگ دوبل دو ساعت و زنگ اشتراکی برای هر دو دبیر یک ساعت به حساب می‌آید.
          </p>
          <div className="flex items-center gap-2">
            <SubmitButton size="sm" pendingLabel="در حال ذخیره…">ذخیره</SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>بستن</Button>
          </div>
        </ActionForm>
      )}
    </div>
  );
}

/** The access decision, shown once the person has registered and has something to decide about. */
function AccessDecision({ teacher, hasActiveAcademicYear }: { teacher: TeacherDetail; hasActiveAcademicYear: boolean }) {
  if (!teacher.statusAction && !teacher.rejectionAction) return null;

  return (
    <div className="border-t border-border pt-4">
      <p className="text-xs font-bold text-muted">دسترسی دبیر</p>
      <p className="mt-1 text-xs leading-6 text-muted">
        {teacher.membershipStatus === "ACTIVE"
          ? "این دبیر به منابع مدرسه دسترسی دارد. با غیرفعال‌سازی، دسترسی او بی‌درنگ قطع می‌شود و پرونده‌اش باقی می‌ماند."
          : teacher.membershipStatus === "PENDING_ADMIN_APPROVAL"
            ? "دبیر ثبت‌نام کرده و شماره‌اش تأیید شده است. با تأیید، دسترسی او فعال می‌شود و ضمن آن ساعت موظفی هفتگی‌اش ثبت می‌گردد."
            : teacher.membershipStatus === "REJECTED"
              ? "ثبت‌نام این دبیر رد شده است. هر زمان بخواهید می‌توانید تأییدش کنید."
              : "دسترسی این دبیر غیرفعال است. با فعال‌سازی، دسترسی او دوباره برقرار می‌شود."}
      </p>
      <div className="mt-3">
        <TeacherRowActions
          registrationId={teacher.registrationId}
          teacherName={teacher.firstName && teacher.lastName ? `${teacher.firstName} ${teacher.lastName}` : teacher.phoneNumber}
          statusAction={teacher.statusAction}
          rejectionAction={teacher.rejectionAction}
          canEditMobile={false}
          canDeleteRegistration={false}
          hasActiveAcademicYear={hasActiveAcademicYear}
          activeAcademicYearName={teacher.academicYearName}
        />
      </div>
    </div>
  );
}
