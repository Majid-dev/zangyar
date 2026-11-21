import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { createStudentAction } from "../actions";

export function StudentCreateForm() {
  return (
    <Panel>
      <SectionHeading title="افزودن دانش‌آموز" description="اطلاعات پایه را ثبت کنید؛ guardian و ثبت‌نام از پرونده قابل تکمیل است." action={<Link href="/students" className="text-sm font-bold text-secondary">انصراف</Link>} />
      <form action={createStudentAction} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="شماره دانش‌آموزی"><Input name="admissionNumber" required /></Field>
        <Field label="نام"><Input name="firstName" required /></Field>
        <Field label="نام خانوادگی"><Input name="lastName" required /></Field>
        <Field label="کد ملی" hint="اختیاری"><Input name="nationalId" inputMode="numeric" dir="ltr" className="text-start" /></Field>
        <Field label="تاریخ تولد" hint="اختیاری"><JalaliDatePicker name="birthDate" /></Field>
        <div className="flex items-end"><Button type="submit">ثبت دانش‌آموز</Button></div>
      </form>
    </Panel>
  );
}
