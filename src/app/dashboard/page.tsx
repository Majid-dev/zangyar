import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { AttendanceSummary } from "@/components/dashboard/attendance-summary";
import { AttentionList } from "@/components/dashboard/attention-list";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { QuickActions } from "@/components/dashboard/quick-actions";

export default function DashboardPage() {
  return (
    <AppShell active="/dashboard">
      <main className="mx-auto max-w-[1440px] p-4 sm:p-6 xl:p-8">
        <PageHeader
          eyebrow="شنبه، ۲۴ آبان ۱۴۰۴ · مدرسه‌ی نمونه‌ی مهر"
          title="صبح بخیر، مدیر مدرسه"
          description="نمایی کوتاه از اتفاق‌های مهم امروز؛ برای شروع روزی منظم و آرام."
          action={<div className="hidden items-center gap-3 sm:flex"><span className="size-2 rounded-full bg-success" aria-hidden="true" /><span className="text-xs font-bold text-muted">سامانه فعال است</span></div>}
        />

        <div className="mt-6 grid gap-4 lg:grid-cols-12">
          <AttendanceSummary />
          <AttentionList />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <ActivityFeed />
          <QuickActions />
          <section className="relative overflow-hidden rounded-2xl bg-primary p-5 text-white shadow-[0_14px_32px_rgba(23,59,87,0.12)] lg:col-span-1">
            <span className="absolute -end-7 -top-7 size-32 rounded-full border-[18px] border-white/5" aria-hidden="true" />
            <p className="text-xs font-bold text-white/60">یادآوری امروز</p>
            <h2 className="mt-3 max-w-[15rem] text-xl font-black leading-8">حضور و غیاب، شروع ارتباط خوب با خانواده‌هاست.</h2>
            <p className="mt-3 max-w-[16rem] text-sm leading-6 text-white/70">ثبت به‌موقع، گزارش دقیق‌تری برای مدرسه و والدین می‌سازد.</p>
            <div className="mt-7 flex items-center gap-2 text-xs font-bold text-accent"><span className="size-2 rounded-full bg-accent" aria-hidden="true" /> ۱۲ کلاس باقی مانده</div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
