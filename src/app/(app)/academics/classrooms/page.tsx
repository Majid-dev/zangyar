import Link from "next/link";

import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { createClassroomAction } from "@/features/academics/actions";
import { listAcademicYearsForContext, listClassroomsWithTeachersForContext, listGradesForContext } from "@/features/academics/queries";
import { classroomSearchSchema } from "@/features/academics/schema";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/field";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { ClassroomEditAction, ClassroomDeleteAction } from "@/features/academics/components/classroom-actions";
import { ClassroomSearch } from "@/features/academics/components/classroom-search";
import { toPersianDigits } from "@/lib/jalali";

const numberFormat = new Intl.NumberFormat("fa-IR");

/**
 * Classrooms and their weekly timetable.
 *
 * This page used to also carry a homeroom teacher, which the timetable replaced:
 * a teacher's place in a class is the hours they teach in it, and a class-level
 * "liable teacher" was a second relationship that no teacher assignment actually
 * needed. What remains a property of the class is how much of it is scheduled, so
 * that is what is shown here, alongside a way into the schedule itself.
 *
 * Each class is a row rather than a wide card. A school has one class per room per
 * year — a primary school easily forty — and the question this page answers is "which
 * one", so the layout is built to show as many at once as it can while keeping the name,
 * the grade, the code, the capacity, and how much of the week is scheduled legible on
 * one line. The actions sit together at the end of the row: the two ways into the
 * class's data first, then the two that change the class itself.
 *
 * The search is one term over the name, the code, and the grade, held in the URL and
 * matched in the query. With no term the page is the whole list; with one it is what
 * matched, and the count beside the heading says which of the two is on screen — a
 * filtered list showing nothing must not read as a school with no classes.
 */
export default async function ClassroomsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const params = await searchParams;
  const parsedSearch = classroomSearchSchema.safeParse({
    q: typeof params.q === "string" ? params.q : undefined,
  });
  const search = parsedSearch.success ? parsedSearch.data.q : undefined;

  const [years, grades, classrooms] = await Promise.all([
    listAcademicYearsForContext(access.context),
    listGradesForContext(access.context),
    listClassroomsWithTeachersForContext(access.context, { search }),
  ]);
  const openYears = years.filter((year) => year.status !== "CLOSED" && year.status !== "ARCHIVED");
  const yearNameById = new Map(years.map((year) => [year.id, year.name]));
  const gradeOptions = grades.map((grade) => ({ id: grade.id, name: grade.name }));

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "ساختار آموزشی", href: "/academics" }, { label: "کلاس‌ها" }]}
        title="کلاس‌ها و برنامه هفتگی"
        description="کلاس در یک سال تحصیلی ساخته می‌شود و درس‌ها و دبیران آن از صفحه برنامه هفتگی زمان‌بندی می‌شوند."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sage px-3 py-1.5 text-xs font-bold text-primary">
              {search
                ? `${numberFormat.format(classrooms.length)} کلاس از نتایج جست‌وجو`
                : `${numberFormat.format(classrooms.length)} کلاس`}
            </span>
            <BackLink href="/academics">بازگشت به ساختار آموزشی</BackLink>
          </div>
        }
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel className="self-start lg:sticky lg:top-6">
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

        <div className="space-y-3">
          <ClassroomSearch initialQuery={search ?? ""} />

          {classrooms.length === 0 ? (
            <Panel>
              <SectionHeading
                title={search ? "کلاسی با این جست‌وجو پیدا نشد" : "هنوز کلاسی ثبت نشده است"}
                description={search
                  ? `هیچ کلاسی با «${search}» هم‌خوان نیست. نام کلاس، کد کلاس، یا نام و کد پایه را جست‌وجو کنید یا عبارت را پاک کنید.`
                  : "نخستین کلاس را از فرم کنار همین صفحه ایجاد کنید."}
              />
            </Panel>
          ) : (
            <ul className="grid gap-2.5">
              {classrooms.map(({ classroom, gradeName, timetableHourCount, enrolledCount }) => (
                <li key={classroom.id}>
                  {/* A row, not a card: one line carries identity on the start side and
                      the numbers on the end side, and the actions sit under them at
                      narrow widths so nothing is squeezed off a phone. */}
                  <Panel className="p-3.5 sm:p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-black text-primary">{classroom.name}</span>
                          <span className="shrink-0 rounded-full bg-sage px-2 py-0.5 text-[0.65rem] font-bold text-primary">{gradeName}</span>
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.7rem] text-muted">
                          <span>کد <span className="font-bold text-primary">{classroom.code}</span></span>
                          <span>ظرفیت <span className="font-bold tabular-nums text-primary">{classroom.capacity === null ? "—" : toPersianDigits(classroom.capacity)}</span></span>
                          <span>
                            {timetableHourCount === 0
                              ? <span className="font-bold text-[#8b5a08]">بدون ساعت برنامه‌ریزی‌شده</span>
                              : <><span className="font-bold tabular-nums text-primary">{toPersianDigits(timetableHourCount)}</span> ساعت در هفته</>}
                          </span>
                          <span>
                            {enrolledCount === 0
                              ? "بدون دانش‌آموز"
                              : <><span className="font-bold tabular-nums text-primary">{toPersianDigits(enrolledCount)}</span> دانش‌آموز</>}
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                        <Link
                          href={`/academics/timetable?classroomId=${classroom.id}&academicYearId=${classroom.academicYearId}`}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-secondary/25 bg-secondary/10 px-3 text-xs font-bold text-secondary transition hover:bg-secondary/15"
                        >
                          {timetableHourCount === 0 ? "تخصیص دبیران" : "برنامه هفتگی"}
                        </Link>
                        {/* The roster sits beside the schedule rather than below it: both
                            are ways into this class's data, and the pair is what an
                            administrator moves between. */}
                        <Link
                          href={`/students?classroomId=${classroom.id}&academicYearId=${classroom.academicYearId}`}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-primary transition hover:border-secondary/40 hover:text-secondary"
                        >
                          دانش‌آموزان
                        </Link>
                        <ClassroomEditAction classroom={classroom} grades={gradeOptions} academicYearName={yearNameById.get(classroom.academicYearId) ?? ""} />
                        <ClassroomDeleteAction classroomId={classroom.id} classroomName={classroom.name} enrolledCount={enrolledCount} />
                      </div>
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppPage>
  );
}
