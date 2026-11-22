"use client";

import { useState, useTransition } from "react";

import { ActionFeedback, ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { GuardianRelationshipField } from "./guardian-relationship-field";
import type { ActionState } from "@/lib/actions/result";
import { formatPersianDate } from "@/lib/date";
import {
  closeEnrollmentAction,
  createEnrollmentAction,
  linkGuardianAction,
  transitionGuardianAction,
  transitionStudentAction,
  updateGuardianAction,
  updateStudentAction,
  updateStudentGuardianAction,
} from "../actions";

const studentStatusLabels = { ACTIVE: "فعال", WITHDRAWN: "ترک‌تحصیل", GRADUATED: "فارغ‌التحصیل", ARCHIVED: "بایگانی‌شده" } as const;

export function StudentProfileCard({ student }: { student: { id: string; admissionNumber: string; firstName: string; lastName: string; nationalId: string | null; birthDate: string | null; status: keyof typeof studentStatusLabels } }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div><p className="text-xs text-muted">کد ملی</p><p className="mt-1 text-sm font-bold text-primary">{student.nationalId ?? "ثبت نشده"}</p></div>
        <div><p className="text-xs text-muted">تاریخ تولد</p><p className="mt-1 text-sm font-bold text-primary">{student.birthDate ? formatPersianDate(student.birthDate) : "ثبت نشده"}</p></div>
        <div><p className="text-xs text-muted">وضعیت</p><p className="mt-1"><Badge tone={student.status === "ACTIVE" ? "success" : "warning"}>{studentStatusLabels[student.status]}</Badge></p></div>
        <div className="flex items-end justify-end"><Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>ویرایش اطلاعات</Button></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ActionForm action={updateStudentAction} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="studentId" value={student.id} />
        <Field label="شماره دانش‌آموزی"><Input name="admissionNumber" defaultValue={student.admissionNumber} required /></Field>
        <Field label="کد ملی" hint="اختیاری"><Input name="nationalId" defaultValue={student.nationalId ?? ""} inputMode="numeric" className="text-start" /></Field>
        <Field label="نام"><Input name="firstName" defaultValue={student.firstName} required /></Field>
        <Field label="نام خانوادگی"><Input name="lastName" defaultValue={student.lastName} required /></Field>
        <Field label="تاریخ تولد" hint="اختیاری"><JalaliDatePicker name="birthDate" defaultValue={student.birthDate} /></Field>
        <div className="flex items-end gap-2"><SubmitButton size="sm" pendingLabel="در حال ذخیره…">ذخیره تغییرات</SubmitButton></div>
      </ActionForm>
      <StudentStatusActions studentId={student.id} status={student.status} />
    </div>
  );
}

function StudentStatusActions({ studentId, status }: { studentId: string; status: keyof typeof studentStatusLabels }) {
  const [state, setState] = useState<ActionState<unknown>>(null);
  const [isPending, startTransition] = useTransition();
  const targets: { value: string; label: string; question: string }[] = [
    { value: "WITHDRAWN", label: "ثبت ترک‌تحصیل", question: "دانش‌آموز ترک‌تحصیل شود؟ ثبت‌نام‌های فعال بسته می‌شوند." },
    { value: "GRADUATED", label: "ثبت فارغ‌التحصیلی", question: "دانش‌آموز فارغ‌التحصیل شود؟" },
    { value: "ARCHIVED", label: "بایگانی پرونده", question: "پرونده بایگانی شود؟" },
  ].filter((target) => target.value !== status);

  function run(target: string) {
    const data = new FormData();
    data.set("studentId", studentId);
    data.set("status", target);
    startTransition(async () => setState(await transitionStudentAction(null, data)));
  }

  if (status !== "ACTIVE") return null;

  return (
    <div className="border-t border-border pt-4">
      <p className="text-xs font-bold text-muted">تغییر وضعیت پرونده</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {targets.map((target) => <Button key={target.value} type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => run(target.value)}>{isPending ? "…" : target.label}</Button>)}
      </div>
      <ActionFeedback state={state} />
    </div>
  );
}

export function GuardianPanel({ studentId, guardians }: { studentId: string; guardians: Array<{ id: string; firstName: string; lastName: string; normalizedMobile: string | null; email: string | null; status: "ACTIVE" | "ARCHIVED"; relationshipType: string; isPrimary: boolean; receivesSms: boolean; isEmergency: boolean }> }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {guardians.length === 0 ? <p className="text-sm text-muted">ولی ثبت نشده است.</p> : null}
      {guardians.map((guardian) => (
        <div key={guardian.id} className="rounded-xl bg-background p-4">
          {editingId === guardian.id ? (
            <ActionForm action={updateGuardianAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="guardianId" value={guardian.id} />
              <input type="hidden" name="studentId" value={studentId} />
              <Field label="نام"><Input name="firstName" defaultValue={guardian.firstName} required /></Field>
              <Field label="نام خانوادگی"><Input name="lastName" defaultValue={guardian.lastName} required /></Field>
              <Field label="شماره همراه"><Input name="normalizedMobile" defaultValue={guardian.normalizedMobile ?? ""} inputMode="tel" dir="ltr" className="text-start" /></Field>
              <Field label="ایمیل" hint="اختیاری"><Input name="email" type="email" defaultValue={guardian.email ?? ""} dir="ltr" className="text-start" /></Field>
              <div className="flex items-end gap-2 sm:col-span-2"><SubmitButton size="sm" pendingLabel="در حال ذخیره…">ذخیره</SubmitButton><Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>بستن</Button></div>
            </ActionForm>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary">{guardian.firstName} {guardian.lastName}</p>
                  <p className="mt-1 text-xs text-muted">{guardian.relationshipType}</p>
                  <p className="mt-1 text-xs text-muted" dir="ltr">{guardian.normalizedMobile ?? "شماره ثبت نشده"}{guardian.email ? ` · ${guardian.email}` : ""}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {guardian.isPrimary ? <Badge tone="info">ولی اصلی</Badge> : null}
                  {guardian.receivesSms ? <Badge tone="success">پیامک</Badge> : null}
                  {guardian.isEmergency ? <Badge tone="warning">اضطراری</Badge> : null}
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(guardian.id)}>ویرایش</Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3">
                <ActionForm action={updateStudentGuardianAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="studentId" value={studentId} />
                  <input type="hidden" name="guardianId" value={guardian.id} />
                  <GuardianRelationshipField label="رابطه" name="relationshipType" value={guardian.relationshipType} />
                  <label className="flex items-center gap-2 pb-2 text-xs font-bold text-primary"><input type="checkbox" name="isPrimary" defaultChecked={guardian.isPrimary} className="size-4" /> اصلی</label>
                  <label className="flex items-center gap-2 pb-2 text-xs font-bold text-primary"><input type="checkbox" name="receivesSms" defaultChecked={guardian.receivesSms} className="size-4" /> پیامک</label>
                  <label className="flex items-center gap-2 pb-2 text-xs font-bold text-primary"><input type="checkbox" name="isEmergency" defaultChecked={guardian.isEmergency} className="size-4" /> اضطراری</label>
                  <div className="pb-1"><SubmitButton size="sm" variant="secondary" pendingLabel="…">ذخیره رابطه</SubmitButton></div>
                </ActionForm>
                <GuardianArchiveAction guardianId={guardian.id} studentId={studentId} status={guardian.status} />
              </div>
            </>
          )}
        </div>
      ))}
      <LinkGuardianForm studentId={studentId} existingCount={guardians.filter((guardian) => guardian.status === "ACTIVE").length} />
    </div>
  );
}

function GuardianArchiveAction({ guardianId, studentId, status }: { guardianId: string; studentId: string; status: "ACTIVE" | "ARCHIVED" }) {
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<ActionState<unknown>>(null);
  const [isPending, startTransition] = useTransition();
  const nextStatus = status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";

  if (!confirming) {
    return (
      <div className="pb-1">
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>{status === "ACTIVE" ? "بایگانی ولی" : "فعال‌سازی ولی"}</Button>
        <ActionFeedback state={state} />
      </div>
    );
  }

  return (
    <div className="pb-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{status === "ACTIVE" ? "ولی بایگانی شود؟" : "ولی فعال شود؟"}</span>
        <Button type="button" size="sm" variant="danger" disabled={isPending} onClick={() => {
          const data = new FormData();
          data.set("guardianId", guardianId);
          data.set("studentId", studentId);
          data.set("status", nextStatus);
          startTransition(async () => { setState(await transitionGuardianAction(null, data)); setConfirming(false); });
        }}>{isPending ? "…" : "تأیید"}</Button>
        <button type="button" onClick={() => setConfirming(false)} className="text-xs font-bold text-muted hover:text-primary">انصراف</button>
      </div>
    </div>
  );
}

function LinkGuardianForm({ studentId, existingCount }: { studentId: string; existingCount: number }) {
  return (
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer text-sm font-bold text-secondary">افزودن ولی جدید</summary>
      <ActionForm action={linkGuardianAction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="guardianId" value="" />
        <p className="text-xs leading-6 text-muted sm:col-span-2">اگر ولی با همین شماره همراه از قبل در مدرسه ثبت شده باشد، همان پرونده بازاستفاده می‌شود.</p>
        <Field label="نام"><Input name="firstName" required /></Field>
        <Field label="نام خانوادگی"><Input name="lastName" required /></Field>
        <Field label="شماره همراه" hint="برای پیامک لازم است"><Input name="normalizedMobile" inputMode="tel" dir="ltr" className="text-start" /></Field>
        <GuardianRelationshipField label="رابطه" />
        <label className="flex items-center gap-2 text-xs font-bold text-primary"><input type="checkbox" name="isPrimary" defaultChecked={existingCount === 0} className="size-4" /> ولی اصلی</label>
        <label className="flex items-center gap-2 text-xs font-bold text-primary"><input type="checkbox" name="receivesSms" defaultChecked className="size-4" /> دریافت پیامک</label>
        <div className="sm:col-span-2"><SubmitButton size="sm" pendingLabel="در حال افزودن…">افزودن ولی</SubmitButton></div>
      </ActionForm>
    </details>
  );
}

export function EnrollmentPanel({ studentId, years, classrooms, enrollments, activeYearId, unenrolledActiveYear }: {
  studentId: string;
  years: Array<{ id: string; name: string }>;
  classrooms: Array<{ id: string; name: string; academicYearId: string }>;
  enrollments: Array<{ id: string; classroomName: string; academicYearName: string; startDate: string; endDate: string | null; status: "ACTIVE" | "ARCHIVED" }>;
  activeYearId: string | null;
  unenrolledActiveYear: boolean;
}) {
  const [yearId, setYearId] = useState(activeYearId ?? "");
  const options = classrooms.filter((classroom) => classroom.academicYearId === yearId);

  return (
    <div className="space-y-5">
      {unenrolledActiveYear ? (
        <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs leading-6 text-[#8b5a08]">
          این دانش‌آموز در سال تحصیلی فعال ثبت‌نام نشده است.
        </p>
      ) : null}

      <div className="divide-y divide-border">
        {enrollments.length === 0 ? <p className="text-sm text-muted">ثبت‌نامی ثبت نشده است.</p> : enrollments.map((enrollment) => (
          <div key={enrollment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
            <div className="min-w-0">
              <p className="text-sm font-bold text-primary">{enrollment.classroomName}</p>
              <p className="mt-1 text-xs text-muted">{enrollment.academicYearName} · {formatPersianDate(enrollment.startDate)} تا {enrollment.endDate ? formatPersianDate(enrollment.endDate) : "اکنون"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={enrollment.status === "ACTIVE" ? "success" : "neutral"}>{enrollment.status === "ACTIVE" ? "فعال" : "بسته"}</Badge>
              {enrollment.status === "ACTIVE" ? <CloseEnrollmentAction enrollmentId={enrollment.id} studentId={studentId} /> : null}
            </div>
          </div>
        ))}
      </div>

      <details className="rounded-xl border border-border p-4" open={enrollments.length === 0}>
        <summary className="cursor-pointer text-sm font-bold text-secondary">ثبت‌نام در سال تحصیلی</summary>
        {years.length === 0 ? (
          <p className="mt-3 text-sm text-muted">سال تحصیلی فعالی وجود ندارد.</p>
        ) : (
          <ActionForm action={createEnrollmentAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="studentId" value={studentId} />
            <Field label="سال تحصیلی"><Select name="academicYearId" value={yearId} onChange={(event) => setYearId(event.target.value)} required><option value="">انتخاب سال</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</Select></Field>
            <Field label="کلاس"><Select name="classroomId" required disabled={!yearId}><option value="">{yearId ? "انتخاب کلاس" : "ابتدا سال را انتخاب کنید"}</option>{options.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</Select></Field>
            <Field label="تاریخ شروع"><JalaliDatePicker name="startDate" required /></Field>
            <Field label="تاریخ پایان" hint="اختیاری"><JalaliDatePicker name="endDate" /></Field>
            <div className="sm:col-span-2"><SubmitButton size="sm" pendingLabel="در حال ثبت‌نام…">ثبت‌نام</SubmitButton></div>
          </ActionForm>
        )}
      </details>
    </div>
  );
}

function CloseEnrollmentAction({ enrollmentId, studentId }: { enrollmentId: string; studentId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>بستن ثبت‌نام</Button>;
  }

  return (
    <ActionForm action={closeEnrollmentAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <input type="hidden" name="studentId" value={studentId} />
      <JalaliDatePicker name="endDate" required />
      <SubmitButton size="sm" variant="danger" pendingLabel="…">تأیید بستن</SubmitButton>
    </ActionForm>
  );
}

