import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { getAttendanceWorkspaceForContext } from "@/features/attendance/queries";
import { AttendanceWorkspace } from "@/features/attendance/components/attendance-workspace";
import { formatPersianDate } from "@/lib/date";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN", "TEACHER"]);
  if (access.blocked) return access.blocked;
  const params = await searchParams;
  const classroomId = typeof params.classroomId === "string" ? params.classroomId : undefined;
  const workspace = await getAttendanceWorkspaceForContext(access.context, classroomId);

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "حضور و غیاب" }]}
        title="ثبت حضور و غیاب"
        description="فهرست کلاس و دانش‌آموزان از ثبت‌نام‌های مؤثر خوانده می‌شود؛ وضعیت امروز را ثبت کنید."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-accent/15 px-3 py-1.5 text-xs font-bold text-[#8b5a08]">{formatPersianDate(workspace.date)}</span>
            <BackLink href="/dashboard">بازگشت به داشبورد</BackLink>
          </div>
        }
      />
      <div className="mt-6">
        <AttendanceWorkspace workspace={workspace} />
      </div>
    </AppPage>
  );
}
