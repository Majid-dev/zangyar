import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { getAttendanceWorkspaceForContext } from "@/features/attendance/queries";
import { AttendanceWorkspace } from "@/features/attendance/components/attendance-workspace";
import { attendanceFilterSchema } from "@/features/attendance/schema";
import { formatPersianDate, getSchoolBusinessDate } from "@/lib/date";

/**
 * Period-level attendance.
 *
 * The page's subject is a period of a class, not a whole day: a class has several
 * lessons a day and each is submitted by whoever owns it that week. `businessDate`
 * is carried explicitly so a School Admin can correct an earlier day while a teacher
 * is held to today.
 *
 * The screen has three separate pieces of state and they are read from three separate
 * parameters, because conflating them was the fault this page was fixed for:
 *
 * - `gradeId` is the administrator's scope. It always names exactly one grade — an
 *   unset one means "the first grade with classes today", resolved by the query — so
 *   there is no "all grades" state to fall into.
 * - `classroomId`, `periodId`, and `submissionStatus` are filters: they narrow the
 *   list within that scope. The server decides which occurrences match.
 * - `openSlotKey` is which occurrence's register is open. It is not a filter, and
 *   opening a card does not write one, so browsing the day never silently rewrites
 *   the list the administrator is looking at.
 *
 * `view` selects between the two readings of "today": `active` (the default) shows
 * only the periods in session at this minute, and `day` shows everything scheduled.
 * The default is deliberately the narrow one — an administrator opening the page
 * wants the class that is happening now — while the wider one stays one explicit
 * click away, and is forced whenever a specific period or register is asked for, so
 * a link to a particular occurrence always opens it.
 *
 * All of this lives in the query string rather than in component state, which is what
 * makes a filtered view a link a School Admin can send or bookmark. A malformed
 * parameter is dropped rather than thrown, so a hand-edited or stale URL degrades to
 * the unfiltered day instead of an error page.
 */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN", "TEACHER"]);
  if (access.blocked) return access.blocked;
  const params = await searchParams;
  const isAdmin = access.context.role === "SCHOOL_ADMIN";
  const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
  const parsedFilters = attendanceFilterSchema.safeParse({
    gradeId: text(params.gradeId),
    classroomId: text(params.classroomId),
    periodId: text(params.periodId),
    openSlotKey: text(params.openSlotKey),
    // The status filter is the administrator's; a teacher's day is their own
    // occurrences, so narrowing it by submission state is not a question they have.
    submissionStatus: isAdmin ? text(params.submissionStatus) : undefined,
  });
  const filters = parsedFilters.success ? parsedFilters.data : {};
  const view = text(params.view) === "day" ? "day" : "active";
  // Only a School Admin may look at a date other than today; for a teacher the
  // server refuses a different date on submit anyway, so offering the control
  // would only produce a refusal.
  const requestedDate = text(params.date);
  const businessDate = isAdmin && requestedDate
    ? requestedDate
    : getSchoolBusinessDate(access.context.school.timezone);
  const workspace = await getAttendanceWorkspaceForContext(access.context, {
    businessDate,
    gradeId: filters.gradeId,
    classroomId: filters.classroomId,
    periodId: filters.periodId,
    submissionStatus: filters.submissionStatus,
    openSlotKey: filters.openSlotKey,
    // Narrowed to what is in session right now only when nothing more specific was
    // asked for: a chosen period, or an explicitly opened register, is a request for
    // that occurrence whether or not its bell is ringing.
    onlyActivePeriod: isAdmin && view === "active" && !filters.periodId && !filters.openSlotKey,
  });

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
        <AttendanceWorkspace workspace={workspace} role={access.context.role} view={view} />
      </div>
    </AppPage>
  );
}
