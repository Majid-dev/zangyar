import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { getSchoolTimetableSettings, listSchoolPeriods } from "@/features/scheduling/queries";
import { SCHOOL_WEEKDAY_LABELS } from "@/features/scheduling/week";
import { ShiftSettingsForm } from "@/features/scheduling/components/shift-settings-form";
import { PeriodsPanel } from "@/features/scheduling/components/periods-panel";

const weekdayEntries = Object.entries(SCHOOL_WEEKDAY_LABELS).map(([value, label]) => ({ value, label }));

/**
 * The school's timetable shape, in two parts: which shift the school runs and
 * when, and the periods that day is divided into.
 *
 * The two are on one page because a period is only meaningful inside a configured
 * day — a school that has periods but no operating days cannot schedule anything,
 * and a school with days but no periods has nothing to schedule into. Splitting
 * them across pages is what produces the "why can't I add a period on Tuesday"
 * class of question.
 *
 * The settings panel is the narrower of the two on a wide screen, because it holds
 * a handful of choices while each period carries two shifts' worth of times and an
 * edit affordance; giving the periods the room they need is the whole reason the
 * proportions differ. On a narrow screen the two stack, settings first, so the day
 * the periods are defined against is chosen before the periods themselves.
 */
export default async function TimetableSettingsPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const [settings, periods] = await Promise.all([
    getSchoolTimetableSettings(access.context),
    listSchoolPeriods(access.context),
  ]);
  // Operating days fall back to a full default week when never saved, so
  // "configured" asks whether the school has actually saved a week — the default
  // it is being shown does not mean it is open yet.
  const configured = settings.operatingDaysConfigured && periods.length > 0;

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "ساختار آموزشی", href: "/academics" }, { label: "شیفت و زنگ‌ها" }]}
        title="شیفت و زنگ‌های مدرسه"
        description="نوع شیفت، روزهای فعالیت و زنگ‌های روز را اینجا تنظیم کنید. تخصیص درس و دبیر به هر زنگ از صفحه برنامه هفتگی انجام می‌شود."
        action={<BackLink href="/academics">بازگشت به ساختار آموزشی</BackLink>}
      />

      {!configured ? (
        <div className="mt-6 rounded-xl border border-warning/35 bg-warning/8 p-4 text-xs leading-6 text-primary" role="status">
          تا زمانی که روزهای فعالیت و حداقل یک زنگ تعیین نشود، ثبت حضور و غیاب و برنامه هفتگی امکان‌پذیر نیست.
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <ShiftSettingsForm
          shiftType={settings.shiftType}
          rotationBaseDate={settings.rotationBaseDate}
          operatingDays={settings.operatingDays}
          weekdays={weekdayEntries}
          academicYearStartDate={settings.activeAcademicYearStartDate}
        />

        <PeriodsPanel
          shiftType={settings.shiftType}
          periods={periods.map((period) => ({
            id: period.id,
            ordinal: period.ordinal,
            startTime: period.startTime,
            endTime: period.endTime,
            afternoonStartTime: period.afternoonStartTime,
            afternoonEndTime: period.afternoonEndTime,
          }))}
        />
      </div>
    </AppPage>
  );
}
