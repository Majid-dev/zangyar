"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ActionFeedback } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import type { ActionState } from "@/lib/actions/result";
import { formatPersianDate } from "@/lib/date";
import { registerStudentAction } from "../actions";
import type { RegisterStudentInput } from "../schema";

type YearOption = { id: string; name: string; code: string; status: string };
type ClassroomOption = { id: string; name: string; code: string; academicYearId: string };
type GuardianDraft = RegisterStudentInput["guardians"][number];

type WizardProps = { years: YearOption[]; classrooms: ClassroomOption[] };

const steps = ["اطلاعات دانش‌آموز", "اولیا", "ثبت‌نام تحصیلی", "بازبینی"] as const;

const emptyGuardian = (): GuardianDraft => ({ firstName: "", lastName: "", normalizedMobile: null, email: null, relationshipType: "", isPrimary: false, receivesSms: true, isEmergency: false });

export function StudentRegistrationWizard({ years, classrooms }: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<ActionState<unknown>>(null);
  const [isPending, startTransition] = useTransition();
  const [student, setStudent] = useState<RegisterStudentInput["student"]>({ admissionNumber: "", firstName: "", lastName: "", nationalId: null, birthDate: null });
  const [guardians, setGuardians] = useState<GuardianDraft[]>([emptyGuardian()]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [startDate, setStartDate] = useState<string | null>(null);

  const activeYears = years.filter((year) => year.status === "ACTIVE");
  const availableClassrooms = useMemo(() => classrooms.filter((classroom) => classroom.academicYearId === academicYearId), [academicYearId, classrooms]);
  const selectedYear = activeYears.find((year) => year.id === academicYearId);
  const selectedClassroom = availableClassrooms.find((classroom) => classroom.id === classroomId);

  function updateStudent<K extends keyof RegisterStudentInput["student"]>(key: K, value: RegisterStudentInput["student"][K]) {
    setStudent((current) => ({ ...current, [key]: value }));
  }

  function updateGuardian(index: number, patch: Partial<GuardianDraft>) {
    setGuardians((current) => current.map((guardian, currentIndex) => currentIndex === index ? { ...guardian, ...patch } : guardian));
  }

  function next() {
    setState(null);
    if (step === 0 && (!student.admissionNumber || !student.firstName || !student.lastName)) {
      setState({ ok: false, kind: "validation", message: "شماره دانش‌آموزی، نام و نام خانوادگی را وارد کنید." });
      return;
    }
    if (step === 1 && guardians.some((guardian) => !guardian.firstName || !guardian.lastName || !guardian.relationshipType)) {
      setState({ ok: false, kind: "validation", message: "نام، نام خانوادگی و رابطه‌ی هر ولی را تکمیل کنید." });
      return;
    }
    if (step === 2 && (!academicYearId || !classroomId || !startDate)) {
      setState({ ok: false, kind: "validation", message: "سال تحصیلی، کلاس و تاریخ شروع ثبت‌نام را انتخاب کنید." });
      return;
    }
    setStep((current) => Math.min(3, current + 1));
  }

  function submit() {
    if (!startDate) return;
    setState(null);
    startTransition(async () => {
      const result = await registerStudentAction({
        student,
        guardians,
        enrollment: { academicYearId, classroomId, startDate, endDate: null },
      });
      setState(result);
      if (result.ok && "studentId" in result.data) {
        window.setTimeout(() => router.push(`/students/${result.data.studentId}`), 900);
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="مراحل ثبت دانش‌آموز" className="order-2 lg:order-1">
        <ol className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2">
          {steps.map((label, index) => (
            <li key={label} className="min-w-max lg:min-w-0">
              <button type="button" disabled={index > step || isPending} onClick={() => index < step && setStep(index)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-xs font-bold ${index === step ? "bg-primary text-white" : index < step ? "bg-sage text-primary" : "text-muted"}`}>
                <span className="flex size-7 items-center justify-center rounded-lg border border-current tabular-nums">{index < step ? "✓" : index + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section className="order-1 min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-[0_8px_24px_rgba(23,59,87,0.04)] lg:order-2 sm:p-6">
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-border pb-5">
          <div><p className="text-xs font-bold text-secondary">گام {step + 1} از {steps.length}</p><h2 className="mt-1 text-xl font-black text-primary">{steps[step]}</h2></div>
          <span className="rounded-full bg-sage px-3 py-1.5 text-xs font-bold text-muted">پیش‌نویس در همین صفحه حفظ می‌شود</span>
        </div>

        {step === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="شماره دانش‌آموزی"><Input value={student.admissionNumber} onChange={(event) => updateStudent("admissionNumber", event.target.value)} required /></Field>
            <Field label="کد ملی" hint="اختیاری"><Input value={student.nationalId ?? ""} onChange={(event) => updateStudent("nationalId", event.target.value || null)} inputMode="numeric" dir="ltr" className="text-start" /></Field>
            <Field label="نام"><Input value={student.firstName} onChange={(event) => updateStudent("firstName", event.target.value)} required /></Field>
            <Field label="نام خانوادگی"><Input value={student.lastName} onChange={(event) => updateStudent("lastName", event.target.value)} required /></Field>
            <Field label="تاریخ تولد" hint="اختیاری"><JalaliDatePicker name="wizard-birth-date" defaultValue={student.birthDate} onValueChange={(value) => updateStudent("birthDate", value)} /></Field>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            {guardians.map((guardian, index) => (
              <div key={index} className="rounded-xl bg-background p-4">
                <div className="mb-4 flex items-center justify-between"><p className="text-sm font-black text-primary">ولی {index + 1}</p>{guardians.length > 1 ? <button type="button" onClick={() => setGuardians((current) => current.filter((_, currentIndex) => currentIndex !== index))} className="text-xs font-bold text-danger">حذف ولی</button> : null}</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="نام"><Input value={guardian.firstName} onChange={(event) => updateGuardian(index, { firstName: event.target.value })} /></Field>
                  <Field label="نام خانوادگی"><Input value={guardian.lastName} onChange={(event) => updateGuardian(index, { lastName: event.target.value })} /></Field>
                  <Field label="شماره همراه" hint="برای پیامک لازم است"><Input value={guardian.normalizedMobile ?? ""} onChange={(event) => updateGuardian(index, { normalizedMobile: event.target.value || null })} inputMode="tel" dir="ltr" className="text-start" /></Field>
                  <Field label="ایمیل" hint="اختیاری"><Input value={guardian.email ?? ""} onChange={(event) => updateGuardian(index, { email: event.target.value || null })} type="email" dir="ltr" className="text-start" /></Field>
                  <Field label="رابطه با دانش‌آموز"><Input value={guardian.relationshipType} onChange={(event) => updateGuardian(index, { relationshipType: event.target.value })} placeholder="مادر، پدر، سرپرست…" /></Field>
                  <div className="flex flex-wrap items-end gap-4 pb-2 text-xs font-bold text-primary sm:col-span-2"><label className="flex items-center gap-2"><input type="checkbox" checked={guardian.isPrimary} onChange={(event) => setGuardians((current) => current.map((item, currentIndex) => ({ ...item, isPrimary: currentIndex === index ? event.target.checked : false })))} className="size-4" /> ولی اصلی</label><label className="flex items-center gap-2"><input type="checkbox" checked={guardian.receivesSms} onChange={(event) => updateGuardian(index, { receivesSms: event.target.checked })} className="size-4" /> دریافت پیامک</label><label className="flex items-center gap-2"><input type="checkbox" checked={guardian.isEmergency} onChange={(event) => updateGuardian(index, { isEmergency: event.target.checked })} className="size-4" /> تماس اضطراری</label></div>
                </div>
              </div>
            ))}
            {guardians.length < 6 ? <Button type="button" variant="secondary" onClick={() => setGuardians((current) => [...current, emptyGuardian()])}>+ افزودن ولی دیگر</Button> : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="سال تحصیلی"><Select value={academicYearId} onChange={(event) => { setAcademicYearId(event.target.value); setClassroomId(""); }}><option value="">انتخاب سال تحصیلی فعال</option>{activeYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</Select></Field>
            <Field label="کلاس"><Select value={classroomId} onChange={(event) => setClassroomId(event.target.value)} disabled={!academicYearId}><option value="">{academicYearId ? "انتخاب کلاس" : "ابتدا سال را انتخاب کنید"}</option>{availableClassrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</Select></Field>
            <Field label="تاریخ شروع ثبت‌نام"><JalaliDatePicker name="wizard-enrollment-date" required defaultValue={startDate} onValueChange={setStartDate} /></Field>
            {!activeYears.length ? <p className="text-sm text-danger sm:col-span-2">سال تحصیلی فعالی برای ثبت‌نام وجود ندارد.</p> : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <ReviewRow label="دانش‌آموز" value={`${student.firstName} ${student.lastName} · کد ${student.admissionNumber}`} />
            <ReviewRow label="اولیا" value={guardians.map((guardian) => `${guardian.firstName} ${guardian.lastName} (${guardian.relationshipType})`).join("، ")} />
            <ReviewRow label="ثبت‌نام" value={`${selectedYear?.name ?? "—"} · ${selectedClassroom?.name ?? "—"} · شروع ${startDate ? formatPersianDate(startDate) : "—"}`} />
            <ActionFeedback state={state} />
          </div>
        ) : null}

        {step < 3 ? <ActionFeedback state={state} /> : null}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          {step > 0 ? <Button type="button" variant="ghost" disabled={isPending} onClick={() => { setState(null); setStep((current) => current - 1); }}>مرحله قبل</Button> : <span />}
          {step < 3 ? <Button type="button" onClick={next} disabled={isPending}>مرحله بعد</Button> : <Button type="button" onClick={submit} disabled={isPending || !startDate}>{isPending ? "در حال ثبت پرونده…" : "ثبت نهایی پرونده"}</Button>}
        </div>
      </section>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 rounded-xl bg-background p-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4"><dt className="text-xs font-bold text-muted">{label}</dt><dd className="text-sm font-bold text-primary">{value}</dd></div>;
}
