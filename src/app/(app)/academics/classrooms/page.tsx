import Link from "next/link";

import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { createClassroomAction } from "@/features/academics/actions";
import { listAcademicYearsForContext, listClassroomsWithTeachersForContext, listGradesForContext } from "@/features/academics/queries";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { toPersianDigits } from "@/lib/jalali";

/**
 * Classrooms and their weekly timetable.
 *
 * This page used to also carry a homeroom teacher, which the timetable replaced:
 * a teacher's place in a class is the hours they teach in it, and a class-level
 * "liable teacher" was a second relationship that no teacher assignment actually
 * needed. What remains a property of the class is how much of it is scheduled, so
 * that is what is shown here, alongside a way into the schedule itself.
 */
export default async function ClassroomsPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;

  const [years, grades, classrooms] = await Promise.all([
    listAcademicYearsForContext(access.context),
    listGradesForContext(access.context),
    listClassroomsWithTeachersForContext(access.context),
  ]);
  const openYears = years.filter((year) => year.status !== "CLOSED" && year.status !== "ARCHIVED");

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "ساختار آموزشی", href: "/academics" }, { label: "کلاس‌ها" }]}
        title="کلاس‌ها و برنامه هفتگی"
        description="کلاس در یک سال تحصیلی ساخته می‌شود و درس‌ها و دبیران آن از صفحه برنامه هفتگی زمان‌بندی می‌شوند."
        action={<BackLink href="/academics">بازگشت به ساختار آموزشی</BackLink>}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel className="self-start">
          <SectionHeading title="کلاس جدید" description="پس از ساخت کلاس، برنامه هفتگی آن را از همین فهرست تکمیل کنید." />
          {openYears.length === 0 || grades.length === 0 ? (
            <p className="mt-5 text-sm leading-7 text-muted">برای ساخت کلاس، ابتدا یک سال تحصیلی و حداقل یک پایه ثبت کنید.</p>
          ) : (
            <ActionForm action={createClassroomAction} className="mt-5 grid gap-4">
              <Field label="سال تحصیلی" name="academicYearId">
                <Select name="academicYearId" required defaultValue="">
                  <option value="" disabled>انتخاب سال تحصیلی</option>
                  {openYears.map((year) => <option key={year.id} value={year.id}>{year.name} [{year.code}]</option>)}
                </Select>
              </Field>
              <Field label="پایه" name="gradeId">
                <Select name="gradeId" required defaultValue="">
                  <option value="" disabled>انتخاب پایه</option>
                  {grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="کد کلاس" name="code"><Input name="code" placeholder="A" required dir="ltr" className="text-start" /></Field>
                <Field label="ظرفیت" name="capacity" hint="اختیاری"><Input name="capacity" type="number" min="1" dir="ltr" className="text-start" /></Field>
              </div>
              <Field label="نام کلاس" name="name"><Input name="name" placeholder="کلاس اول الف" required /></Field>
              <div><SubmitButton className="w-full" pendingLabel="در حال ایجاد…">ایجاد کلاس</SubmitButton></div>
            </ActionForm>
          )}
        </Panel>

        <div className="space-y-4">
          {classrooms.length === 0 ? (
            <Panel><p className="text-sm text-muted">هنوز کلاسی ثبت نشده است.</p></Panel>
          ) : classrooms.map(({ classroom, timetableHourCount }) => (
            <Panel key={classroom.id}>
              <SectionHeading
                eyebrow={`ظرفیت ${classroom.capacity === null ? "—" : toPersianDigits(classroom.capacity)}`}
                title={classroom.name}
                description={`کد ${classroom.code} · ${timetableHourCount === 0 ? "بدون ساعت برنامه‌ریزی‌شده" : `${toPersianDigits(timetableHourCount)} ساعت در هفته`}`}
                action={
                  <Link
                    href={`/academics/timetable?classroomId=${classroom.id}&academicYearId=${classroom.academicYearId}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-secondary/25 bg-secondary/10 px-3 text-xs font-bold text-secondary transition hover:bg-secondary/15"
                  >
                    {timetableHourCount === 0 ? "تخصیص دبیران" : "برنامه هفتگی"}
                  </Link>
                }
              />

              <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
                <Link href={`/students?classroomId=${classroom.id}&academicYearId=${classroom.academicYearId}`}>
                  <Button variant="ghost" size="sm">دانش‌آموزان کلاس</Button>
                </Link>
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </AppPage>
  );
}
