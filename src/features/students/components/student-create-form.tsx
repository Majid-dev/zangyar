import Link from "next/link";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { createStudentAction } from "../actions";

export function StudentCreateForm() {
  return (
    <Panel>
      <SectionHeading title="افزودن دانش‌آموز" description="اطلاعات پایه را ثبت کنید؛ guardian و ثبت‌نام از پرونده قابل تکمیل است." action={<Link href="/students" className="text-sm font-bold text-secondary">انصراف</Link>} />
      <ActionForm action={createStudentAction} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="شماره دانش‌آموزی" name="admissionNumber"><Input name="admissionNumber" required /></Field>
        <Field label="نام" name="firstName"><Input name="firstName" required /></Field>
        <Field label="نام خانوادگی" name="lastName"><Input name="lastName" required /></Field>
        <Field label="کد ملی" name="nationalId" hint="اختیاری"><Input name="nationalId" inputMode="numeric" dir="ltr" className="text-start" /></Field>
        <Field label="تاریخ تولد" name="birthDate" hint="اختیاری"><JalaliDatePicker name="birthDate" /></Field>
        <div className="flex items-end"><SubmitButton pendingLabel="در حال ثبت…">ثبت دانش‌آموز</SubmitButton></div>
      </ActionForm>
    </Panel>
  );
}
