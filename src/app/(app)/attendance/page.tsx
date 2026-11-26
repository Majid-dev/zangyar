import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { getAttendanceWorkspaceForContext } from "@/features/attendance/queries";
import { AttendanceWorkspace } from "@/features/attendance/components/attendance-workspace";
import { formatPersianDate, getSchoolBusinessDate } from "@/lib/date";

/**
 * Period-level attendance.
 *
 * The page's subject is a period of a class, not a whole day: a class has several
 * lessons a day and each is submitted by whoever owns it that week. `classroomId`
 * and `periodId` in the query string name which one is open, and `businessDate` is
 * carried explicitly so a School Admin can correct an earlier day while a teacher
 * is held to today.
 */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN", "TEACHER"]);
  if (access.blocked) return access.blocked;
  const params = await searchParams;
  const periodId = typeof params.periodId === "string" ? params.periodId : undefined;
  const classroomId = typeof params.classroomId === "string" ? params.classroomId : undefined;
  // Only a School Admin may look at a date other than today; for a teacher the
  // server refuses a different date on submit anyway, so offering the control
  // would only produce a refusal.
  const requestedDate = typeof params.date === "string" ? params.date : undefined;
  const businessDate = access.context.role === "SCHOOL_ADMIN" && requestedDate
    ? requestedDate
    : getSchoolBusinessDate(access.context.school.timezone);
  const workspace = await getAttendanceWorkspaceForContext(access.context, { businessDate, periodId, classroomId });

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "حضور و غیاب" }]}
        title="ثبت حضور و غیاب"
        description="برای هر زنگ، فهرست دانش‌آموزان از ثبت‌نام‌های مؤثر خوانده می‌شود؛ وضعیت همان زنگ را ثبت کنید."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-accent/15 px-3 py-1.5 text-xs font-bold text-[#8b5a08]">{formatPersianDate(workspace.businessDate)}</span>
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
