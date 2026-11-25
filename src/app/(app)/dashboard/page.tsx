import { AppPage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AttentionList } from "@/components/dashboard/attention-list";
import { AttendanceSummary } from "@/components/dashboard/attendance-summary";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { getDashboardDataForContext } from "@/features/dashboard/queries";
import { formatPersianDate } from "@/lib/date";

export default async function DashboardPage() {
  const access = await requirePageAccess();
  if (access.blocked) return access.blocked;

  const data = await getDashboardDataForContext(access.context);

  return (
    <AppPage>
      <PageHeader
        title="صبح بخیر"
        description="نمایی کوتاه از وضعیت امروز مدرسه؛ برای شروع روزی منظم و آرام."
        action={
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="rounded-full bg-sage px-3 py-1.5 text-xs font-bold text-primary">{formatPersianDate(data.date)}</span>
            <span className="flex items-center gap-2 text-xs font-bold text-muted"><span className="size-2 rounded-full bg-success" aria-hidden="true" />سامانه فعال است</span>
          </div>
        }
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        <AttendanceSummary summary={data.attendance} />
        <AttentionList items={data.attention} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ActivityFeed date={formatPersianDate(data.date)} pendingClassroomCount={data.attendance.pendingClassroomCount} />
        <QuickActions pendingClassroomCount={data.attendance.pendingClassroomCount} />
        <section className="relative overflow-hidden rounded-2xl bg-primary p-5 text-white shadow-[0_14px_32px_rgba(23,59,87,0.12)] lg:col-span-1">
          <span className="absolute -end-7 -top-7 size-32 rounded-full border-[18px] border-white/5" aria-hidden="true" />
          <p className="text-xs font-bold text-white/60">یادآوری امروز</p>
          <h2 className="mt-3 max-w-[15rem] text-xl font-black leading-8">حضور و غیاب، شروع ارتباط خوب با خانواده‌هاست.</h2>
          <p className="mt-3 max-w-[16rem] text-sm leading-6 text-white/70">ثبت به‌موقع، گزارش دقیق‌تری برای مدرسه و خانواده‌ها می‌سازد.</p>
          <div className="mt-7 flex items-center gap-2 text-xs font-bold text-accent">
            <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
            {data.attendance.pendingClassroomCount === 0 ? "ثبت امروز کامل شده" : `${data.attendance.pendingClassroomCount} کلاس باقی مانده`}
          </div>
        </section>
      </div>
    </AppPage>
  );
}
