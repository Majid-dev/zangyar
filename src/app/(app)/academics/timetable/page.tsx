import Link from "next/link";

import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { listAcademicYearsForContext, listClassroomsForContext } from "@/features/academics/queries";
import { getSchoolTimetableSettings, getTimetableGridForContext } from "@/features/scheduling/queries";
import { TimetableGrid } from "@/features/scheduling/components/timetable-grid";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { toPersianDigits } from "@/lib/jalali";

/**
 * One classroom's weekly timetable, and the interface that fills it.
 *
 * The page is a day-by-period grid because a timetable's whole meaning is the
 * two-dimensional question "what is happening in this hour, on this day", and a
 * list makes double-booking and free hours invisible. Only the school's configured
 * operating days appear, so a date the school is closed cannot be scheduled even by
 * accident.
 *
 * Everything the grid needs is read and shaped together in
 * `getTimetableGridForContext`, so the teacher list, the hours each teacher already
 * holds, and the assignments drawn in the cells all come from one consistent read
 * rather than from several that could disagree.
 */
export default async function TimetablePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const params = await searchParams;
  const requestedClassroomId = typeof params.classroomId === "string" ? params.classroomId : undefined;
  const requestedYearId = typeof params.academicYearId === "string" ? params.academicYearId : undefined;

  const [years, classrooms, settings] = await Promise.all([
    listAcademicYearsForContext(access.context),
    listClassroomsForContext(access.context),
    getSchoolTimetableSettings(access.context),
  ]);
  const scopedClassrooms = requestedYearId ? classrooms.filter((classroom) => classroom.academicYearId === requestedYearId) : classrooms;
  const selectedClassroom = scopedClassrooms.find((classroom) => classroom.id === requestedClassroomId) ?? null;
  const grid = selectedClassroom
    ? await getTimetableGridForContext(access.context, { classroomId: selectedClassroom.id, academicYearId: selectedClassroom.academicYearId })
    : null;

  const readyForSlots = classrooms.length > 0 && settings.operatingDays.length > 0 && grid !== null && grid.periods.length > 0;

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "ساختار آموزشی", href: "/academics" }, { label: "برنامه هفتگی" }]}
        title="برنامه هفتگی"
        description="برای هر کلاس، خانه‌های هفته را انتخاب کنید و دبیر و درس هر یک را تعیین کنید. خانه‌ها را می‌توانید یک‌جا یا جداگانه پر کنید."
        action={<BackLink href="/academics">بازگشت به ساختار آموزشی</BackLink>}
      />

      <div className="mt-6">
        <Panel>
          <SectionHeading title="انتخاب کلاس" description="برنامه هفتگی همیشه برای یک کلاس و یک سال تحصیلی نمایش داده می‌شود." />
          <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Field label="سال تحصیلی" name="academicYearId">
                <Select name="academicYearId" defaultValue={requestedYearId ?? ""}>
                  <option value="">همه سال‌ها</option>
                  {years.map((year) => <option key={year.id} value={year.id}>{year.name} [{year.code}]</option>)}
                </Select>
              </Field>
            </div>
            <div className="min-w-56 flex-1">
              <Field label="کلاس" name="classroomId">
                <Select name="classroomId" defaultValue={selectedClassroom?.id ?? ""}>
                  <option value="">انتخاب کلاس</option>
                  {scopedClassrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name} [{classroom.code}]</option>)}
                </Select>
              </Field>
            </div>
            <Button type="submit" variant="secondary">نمایش برنامه</Button>
          </form>
        </Panel>
      </div>

      {!readyForSlots ? (
        <div className="mt-4">
          <Panel>
            <SectionHeading
              title="پیش‌نیازهای برنامه هفتگی کامل نیست"
              description="برای ثبت برنامه، کلاس، دبیر فعال با ساعت موظفی، روزهای فعالیت و حداقل یک زنگ لازم است."
              action={<Link href="/academics/periods"><Button variant="secondary" size="sm">تنظیم شیفت و زنگ‌ها</Button></Link>}
            />
          </Panel>
        </div>
      ) : null}

      {grid && readyForSlots ? (
        <div className="mt-4">
          <TimetableGrid
            data={{
              classroomId: grid.classroomId,
              classroomName: grid.classroomName,
              academicYearId: grid.academicYearId,
              operatingDays: settings.operatingDays,
              periods: grid.periods,
              subjects: grid.subjects,
              teachers: grid.teachers,
              assigned: grid.assigned,
              teacherBusyElsewhere: grid.teacherBusyElsewhere,
            }}
          />
        </div>
      ) : classrooms.length > 0 && !selectedClassroom ? (
        <div className="mt-4">
          <Panel><p className="text-sm text-muted">برای مشاهده برنامه هفتگی، یک کلاس انتخاب کنید.</p></Panel>
        </div>
      ) : null}

      {grid && readyForSlots ? (
        <p className="mt-4 text-xs leading-6 text-muted">
          ساعت تخصیص‌یافته هر دبیر از روی همین برنامه محاسبه می‌شود؛ گزارش کامل در{" "}
          <Link href="/academics/hours" className="font-bold text-secondary hover:underline">ساعت موظفی دبیران</Link> است.
          {settings.shiftType === "ROTATING" ? ` هفته‌های چرخشی این مدرسه ${toPersianDigits(settings.operatingDays.length)} روز فعالیت دارند.` : null}
        </p>
      ) : null}
    </AppPage>
  );
}
