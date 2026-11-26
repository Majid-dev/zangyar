import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { getSchoolTimetableSettings, listSchoolPeriods } from "@/features/scheduling/queries";
import { deletePeriodAction, upsertPeriodAction } from "@/features/scheduling/actions";
import { SCHOOL_WEEKDAY_LABELS } from "@/features/scheduling/week";
import { ShiftSettingsForm } from "@/features/scheduling/components/shift-settings-form";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { toPersianDigits } from "@/lib/jalali";

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
 */
export default async function TimetableSettingsPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const [settings, periods] = await Promise.all([
    getSchoolTimetableSettings(access.context),
    listSchoolPeriods(access.context),
  ]);
  const configured = settings.operatingDays.length > 0 && periods.length > 0;

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

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ShiftSettingsForm
          shiftType={settings.shiftType}
          rotationBaseDate={settings.rotationBaseDate}
          operatingDays={settings.operatingDays}
          weekdays={weekdayEntries}
        />

        <Panel className="self-start">
          <SectionHeading
            eyebrow={`${toPersianDigits(periods.length)} زنگ`}
            title="زنگ‌های روز"
            description="هر زنگ دو ساعت است؛ در برنامه هفتگی می‌توانید کل زنگ یا فقط یک ساعت آن را به دبیر بدهید."
          />

          <div className="mt-5 divide-y divide-border border-t border-border">
            {periods.length === 0 ? (
              <p className="py-4 text-sm text-muted">هنوز زنگی تعریف نشده است.</p>
            ) : periods.map((period) => (
              <div key={period.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-bold text-primary">زنگ {toPersianDigits(period.ordinal)}</p>
                  <p className="mt-1 text-xs tabular-nums text-muted" dir="ltr">{period.startTime.slice(0, 5)} – {period.endTime.slice(0, 5)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-sage px-2.5 py-1 text-[11px] font-bold text-primary">۲ ساعت</span>
                  <ActionForm action={deletePeriodAction}>
                    <input type="hidden" name="periodId" value={period.id} />
                    <SubmitButton size="sm" variant="ghost" pendingLabel="…">حذف</SubmitButton>
                  </ActionForm>
                </div>
              </div>
            ))}
          </div>

          <ActionForm action={upsertPeriodAction} className="mt-5 grid gap-4 border-t border-border pt-5">
            <p className="text-xs leading-6 text-muted">
              زنگ‌ها به ترتیب ساعت شروع شماره‌گذاری می‌شوند و نباید با هم هم‌پوشانی داشته باشند.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="شروع" name="startTime"><Input name="startTime" type="time" required dir="ltr" className="text-start" /></Field>
              <Field label="پایان" name="endTime"><Input name="endTime" type="time" required dir="ltr" className="text-start" /></Field>
            </div>
            <div><SubmitButton variant="secondary" pendingLabel="در حال ذخیره…">افزودن زنگ</SubmitButton></div>
          </ActionForm>
        </Panel>
      </div>
    </AppPage>
  );
}
