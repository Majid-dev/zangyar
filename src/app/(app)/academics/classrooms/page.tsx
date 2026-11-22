import Link from "next/link";

import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { assignTeacherAction, createClassroomAction } from "@/features/academics/actions";
import {
  listAcademicYearsForContext,
  listClassroomsWithTeachersForContext,
  listGradesForContext,
  listSubjectsForContext,
  listTeacherMembershipsForContext,
} from "@/features/academics/queries";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { formatPersianDate } from "@/lib/date";

export default async function ClassroomsPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;

  const [years, grades, subjects, teachers, classroomsWithTeachers] = await Promise.all([
    listAcademicYearsForContext(access.context),
    listGradesForContext(access.context),
    listSubjectsForContext(access.context),
    listTeacherMembershipsForContext(access.context),
    listClassroomsWithTeachersForContext(access.context),
  ]);

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "ساختار آموزشی", href: "/academics" }, { label: "کلاس‌ها و دبیران" }]}
        title="کلاس‌ها و دبیران"
        description="کلاس‌ها در یک سال تحصیلی ساخته می‌شوند و دبیران از عضویت‌های معتبر مدرسه تخصیص می‌یابند."
        action={<BackLink href="/academics">بازگشت به ساختار آموزشی</BackLink>}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel className="self-start">
          <SectionHeading title="کلاس جدید" />
          {years.filter((year) => year.status !== "CLOSED" && year.status !== "ARCHIVED").length === 0 || grades.length === 0 ? (
            <p className="mt-5 text-sm leading-7 text-muted">برای ساخت کلاس، ابتدا یک سال تحصیلی و حداقل یک پایه ثبت کنید.</p>
          ) : (
            <ActionForm action={createClassroomAction} className="mt-5 grid gap-4">
              <Field label="سال تحصیلی" name="academicYearId">
                <Select name="academicYearId" required defaultValue="">
                  <option value="" disabled>انتخاب سال تحصیلی</option>
                  {years.filter((year) => year.status !== "CLOSED" && year.status !== "ARCHIVED").map((year) => <option key={year.id} value={year.id}>{year.name} [{year.code}]</option>)}
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
          {classroomsWithTeachers.length === 0 ? (
            <Panel><p className="text-sm text-muted">هنوز کلاسی ثبت نشده است.</p></Panel>
          ) : classroomsWithTeachers.map(({ classroom, assignments }) => (
            <Panel key={classroom.id}>
              <SectionHeading
                eyebrow={`ظرفیت ${classroom.capacity ?? "—"}`}
                title={classroom.name}
                description={`کد ${classroom.code} · ${assignments.length} تخصیص دبیر`}
                action={<Link href={`/students?classroomId=${classroom.id}&academicYearId=${classroom.academicYearId}`} aria-label={`مشاهده دانش‌آموزان ${classroom.name}`} title="مشاهده دانش‌آموزان" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-secondary/25 bg-secondary/10 px-3 text-xs font-bold text-secondary transition hover:bg-secondary/15"><span aria-hidden="true">◧</span>مشاهده دانش‌آموزان</Link>}
              />

              <div className="mt-5 divide-y divide-border border-t border-border">
                {assignments.length === 0 ? (
                  <p className="py-4 text-sm text-muted">دبیری برای این کلاس تخصیص نیافته است.</p>
                ) : assignments.map(({ assignment, teacher, membership }) => (
                  <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-bold text-primary">{teacher.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {formatPersianDate(assignment.startDate)}{assignment.endDate ? ` تا ${formatPersianDate(assignment.endDate)}` : " تا اکنون"}
                        {assignment.subjectId ? " · درس تخصصی" : " · همه درس‌ها"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {assignment.isPrimary ? <Badge tone="info">دبیر اصلی</Badge> : null}
                      <Badge tone={membership.status === "ACTIVE" ? "success" : "warning"}>{membership.role === "TEACHER" ? "دبیر" : "مدیر"}</Badge>
                    </div>
                  </div>
                ))}
              </div>

              {teachers.length === 0 ? (
                <p className="mt-5 text-sm text-muted">برای تخصیص دبیر، ابتدا یک عضویت دبیر در مدرسه ثبت کنید.</p>
              ) : (
                <ActionForm action={assignTeacherAction} className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                  <input type="hidden" name="classroomId" value={classroom.id} />
                  <Field label="دبیر" name="teacherMembershipId">
                    <Select name="teacherMembershipId" required defaultValue="">
                      <option value="" disabled>انتخاب دبیر</option>
                      {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.userName}</option>)}
                    </Select>
                  </Field>
                  <Field label="درس" name="subjectId" hint="اختیاری">
                    <Select name="subjectId" defaultValue="">
                      <option value="">همه درس‌ها</option>
                      {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="شروع تخصیص" name="startDate"><JalaliDatePicker name="startDate" required /></Field>
                  <Field label="پایان" name="endDate" hint="اختیاری"><JalaliDatePicker name="endDate" /></Field>
                  <label className="flex items-center gap-2 text-sm font-bold text-primary sm:col-span-2">
                    <input name="isPrimary" type="checkbox" className="size-4" />
                    دبیر اصلی کلاس
                  </label>
                  <div className="sm:col-span-2"><SubmitButton variant="secondary" pendingLabel="در حال تخصیص…">تخصیص دبیر</SubmitButton></div>
                </ActionForm>
              )}
            </Panel>
          ))}
        </div>
      </div>
    </AppPage>
  );
}
