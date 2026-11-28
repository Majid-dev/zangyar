import { AppPage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AttendanceSummary } from "@/components/dashboard/attendance-summary";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { SchoolAttentionList, SchoolAttendanceLedger } from "@/components/dashboard/school-attendance-ledger";
import { TeacherDayPanel, TeacherSummaryPanel } from "@/components/dashboard/teacher-attendance-panels";
import { getDashboardDataForContext } from "@/features/dashboard/queries";
import { formatPersianDate } from "@/lib/date";

/**
 * The dashboard, which is two pages with one route.
 *
 * A School Admin gets the school's day as a ledger: how much of it has been recorded,
 * what is still owed, and who holds it. A teacher gets their own day: the periods the
 * week has handed them, in the order they should be taken, and no school-wide figure
 * at all — the figures a teacher can act on are the ones about their own registers,
 * and a school-wide total is not one of them.
 *
 * Which of the two is rendered is decided by the role the membership already carries,
 * and the data behind it is shaped by role in the query. The branch here is
 * presentation; the authorization is that a teacher's read never fetched the
 * school-wide figures in the first place, so there is nothing to hide.
 */
export default async function DashboardPage() {
  const access = await requirePageAccess();
  if (access.blocked) return access.blocked;

  const data = await getDashboardDataForContext(access.context);
  const isAdmin = access.context.role === "SCHOOL_ADMIN";

  return (
    <AppPage>
      <PageHeader
        title={isAdmin ? "صبح بخیر" : "روز کاری شما"}
        description={isAdmin
          ? "نمایی از وضعیت امروز مدرسه؛ چه چیزی ثبت شده و چه چیزی باقی مانده است."
          : "زنگ‌های امروز شما و آنچه برای ثبت حضور و غیاب باقی مانده است."}
        action={
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="rounded-full bg-sage px-3 py-1.5 text-xs font-bold text-primary">{formatPersianDate(data.date)}</span>
            <span className="flex items-center gap-2 text-xs font-bold text-muted"><span className="size-2 rounded-full bg-success" aria-hidden="true" />سامانه فعال است</span>
          </div>
        }
      />

      {isAdmin && data.overview ? (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-12">
            <SchoolAttendanceLedger overview={data.overview} date={data.date} />
            <SchoolAttentionList items={data.attention} date={data.date} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <AttendanceSummary summary={data.attendance} />
            <div className="lg:col-span-5">
              <QuickActions pendingPeriodCount={data.attendance.pendingPeriodCount} isAdmin />
            </div>
          </div>


          {data.overview.missingCount > 0 ? (
            <section className="mt-4 relative overflow-hidden rounded-2xl bg-primary p-5 text-white shadow-[0_14px_32px_rgba(23,59,87,0.12)]">
              <span className="absolute -end-7 -top-7 size-32 rounded-full border-[18px] border-white/5" aria-hidden="true" />
              <p className="text-xs font-bold text-white/60">نیازمند پیگیری</p>
              <h2 className="mt-3 max-w-[24rem] text-xl font-black leading-8">
                {`${new Intl.NumberFormat("fa-IR").format(data.overview.missingCount)} زنگ امروز بدون ثبت حضور از مهلت گذشته است.`}
              </h2>
              <p className="mt-3 max-w-[30rem] text-sm leading-6 text-white/70">
                ثبت‌نشده ماندن یک زنگ یعنی خانواده‌ها پیامی دریافت نکرده‌اند. برای اصلاح، زنگ را از فهرست بالا باز کنید؛ مدیر مدرسه محدود به مهلت زنگ نیست.
              </p>
            </section>
          ) : null}
        </>
      ) : data.teacherOverview ? (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-12">
            <TeacherDayPanel overview={data.teacherOverview} slots={data.slots} date={data.date} />
            <TeacherSummaryPanel overview={data.teacherOverview} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <ActivityFeed date={formatPersianDate(data.date)} pendingPeriodCount={data.teacherOverview.pendingPeriodCount + data.teacherOverview.missingPeriodCount} />
            </div>
            <div className="lg:col-span-5">
              <QuickActions pendingPeriodCount={data.teacherOverview.pendingPeriodCount + data.teacherOverview.missingPeriodCount} isAdmin={false} />
            </div>
          </div>
        </>
      ) : (
        <div className="mt-6">
          <AttendanceSummary summary={data.attendance} />
        </div>
      )}
    </AppPage>
  );
}
