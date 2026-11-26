import Link from "next/link";

import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { listAcademicYearsForContext, listTeacherMembershipsForContext } from "@/features/academics/queries";
import { getTeacherHourReportForContext, listSchedulableAcademicYears } from "@/features/scheduling/queries";
import { setTeacherWeeklyHoursAction } from "@/features/scheduling/actions";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { toPersianDigits } from "@/lib/jalali";

/**
 * Assigned versus mandatory weekly hours.
 *
 * The numbers are read from the timetable rather than kept beside it, so the page
 * cannot disagree with the schedule it reports on. An assignment is one teaching
 * hour, so the figure is a count of the entries naming each teacher — a period split
 * between two teachers contributes the one hour each of them holds.
 */
export default async function TeacherHoursPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const params = await searchParams;
  const requestedYearId = typeof params.academicYearId === "string" ? params.academicYearId : undefined;

  const [years, teachers] = await Promise.all([
    listAcademicYearsForContext(access.context),
    listTeacherMembershipsForContext(access.context),
  ]);
  const schedulable = await listSchedulableAcademicYears(access.context);
  const selectedYear = years.find((year) => year.id === requestedYearId) ?? years.find((year) => year.status === "ACTIVE") ?? years[0] ?? null;
  const report = selectedYear ? await getTeacherHourReportForContext(access.context, selectedYear.id) : [];
  const teacherNameById = new Map(teachers.map((teacher) => [teacher.id, teacher.userName]));
  const rows = report
    .map((row) => ({ ...row, name: teacherNameById.get(row.teacherMembershipId) ?? "دبیر نامشخص" }))
    .sort((left, right) => left.name.localeCompare(right.name, "fa"));
  const understaffed = rows.filter((row) => row.difference !== null && row.difference < 0).length;

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "ساختار آموزشی", href: "/academics" }, { label: "ساعت موظفی دبیران" }]}
        title="ساعت موظفی دبیران"
        description="ساعت هفتگی هر دبیر از برنامه هفتگی خوانده می‌شود؛ هر خانه برنامه یک ساعت است و برای دبیری که در آن نام برده شده به حساب می‌آید."
        action={<BackLink href="/academics">بازگشت به ساختار آموزشی</BackLink>}
      />

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-56">
            <Field label="سال تحصیلی" name="academicYearId">
              <Select name="academicYearId" defaultValue={selectedYear?.id ?? ""}>
                {years.map((year) => <option key={year.id} value={year.id}>{year.name} [{year.code}]</option>)}
              </Select>
            </Field>
          </div>
          <Button type="submit" variant="secondary">نمایش گزارش</Button>
        </form>
        {selectedYear ? (
          <Badge tone={understaffed > 0 ? "warning" : "success"}>
            {understaffed === 0 ? "همه دبیران ساعت موظفی خود را پر کرده‌اند" : `${toPersianDigits(understaffed)} دبیر کمتر از ساعت موظفی`}
          </Badge>
        ) : null}
      </div>

      {!selectedYear ? (
        <div className="mt-4"><Panel><p className="text-sm text-muted">برای مشاهده گزارش، ابتدا یک سال تحصیلی بسازید.</p></Panel></div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel className="self-start overflow-hidden p-0">
            <div className="p-4 sm:p-5">
              <SectionHeading eyebrow={selectedYear.name} title="ساعت تخصیص‌یافته و موظفی" description="ساعت تخصیص‌یافته از خانه‌های فعال برنامه هفتگی شمرده می‌شود." />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="bg-sage/50 text-xs font-bold text-muted">
                    <th scope="col" className="p-3 text-start">دبیر</th>
                    <th scope="col" className="p-3 text-start">زنگ‌ها</th>
                    <th scope="col" className="p-3 text-start">ساعت تخصیص‌یافته</th>
                    <th scope="col" className="p-3 text-start">ساعت موظفی</th>
                    <th scope="col" className="p-3 text-start">اختلاف</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-sm text-muted">برای این سال، برنامه هفتگی یا ساعت موظفی ثبت نشده است.</td></tr>
                  ) : rows.map((row) => (
                    <tr key={row.teacherMembershipId} className="border-t border-border">
                      <th scope="row" className="p-3 text-start font-bold text-primary">{row.name}</th>
                      <td className="p-3 tabular-nums text-muted">{toPersianDigits(row.slotCount)}</td>
                      <td className="p-3 tabular-nums font-bold text-primary">{toPersianDigits(row.assignedWeeklyHours)}</td>
                      <td className="p-3 tabular-nums text-muted">{row.requiredWeeklyHours === null ? "تعیین نشده" : toPersianDigits(row.requiredWeeklyHours)}</td>
                      <td className="p-3">
                        {row.difference === null ? (
                          <span className="text-xs text-muted">—</span>
                        ) : row.difference === 0 ? (
                          <Badge tone="success">کامل</Badge>
                        ) : row.difference > 0 ? (
                          <Badge tone="info">{toPersianDigits(row.difference)} ساعت اضافه</Badge>
                        ) : (
                          <Badge tone="warning">{toPersianDigits(Math.abs(row.difference))} ساعت کم</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel className="self-start">
            <SectionHeading title="ثبت ساعت موظفی" description="هر دبیر در هر سال تحصیلی یک عدد دارد؛ ثبت دوباره همان عدد را اصلاح می‌کند." />
            {schedulable.length === 0 ? (
              <p className="mt-5 text-sm text-muted">سال تحصیلی قابل ویرایشی وجود ندارد.</p>
            ) : teachers.length === 0 ? (
              <p className="mt-5 text-sm text-muted">برای ثبت ساعت موظفی، ابتدا یک عضویت دبیر در مدرسه ثبت کنید.</p>
            ) : (
              <ActionForm action={setTeacherWeeklyHoursAction} className="mt-5 grid gap-4">
                <Field label="سال تحصیلی" name="academicYearId">
                  <Select name="academicYearId" required defaultValue={selectedYear.id}>
                    {schedulable.map((year) => <option key={year.id} value={year.id}>{year.name} [{year.code}]</option>)}
                  </Select>
                </Field>
                <Field label="دبیر" name="teacherMembershipId">
                  <Select name="teacherMembershipId" required defaultValue="">
                    <option value="" disabled>انتخاب دبیر</option>
                    {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.userName}</option>)}
                  </Select>
                </Field>
                <Field label="ساعت موظفی هفتگی" name="requiredWeeklyHours">
                  <Input name="requiredWeeklyHours" type="number" min="0" max="60" required dir="ltr" className="text-start" />
                </Field>
                <div><SubmitButton className="w-full" pendingLabel="در حال ثبت…">ثبت ساعت موظفی</SubmitButton></div>
              </ActionForm>
            )}
            <p className="mt-5 text-xs leading-6 text-muted">
              ساعت تخصیص‌یافته از روی برنامه هفتگی شمرده می‌شود؛ برای رساندن دبیر به ساعت موظفی، خانه‌های او را در{" "}
              <Link href="/academics/timetable" className="font-bold text-secondary hover:underline">برنامه هفتگی</Link> تکمیل کنید.
            </p>
          </Panel>
        </div>
      )}
    </AppPage>
  );
}
