import { headers } from "next/headers";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/app/academics/_components/route-access";
import { getAttendanceWorkspace } from "@/features/attendance/queries";
import { AttendanceWorkspace } from "@/features/attendance/components/attendance-workspace";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN", "TEACHER"]);
  if (access.blocked) return access.blocked;
  const params = await searchParams;
  const classroomId = typeof params.classroomId === "string" ? params.classroomId : undefined;
  const workspace = await getAttendanceWorkspace({ headers: await headers(), classroomId });

  return (
    <AppShell active="/attendance">
      <main className="mx-auto max-w-[1440px] p-4 sm:p-6 xl:p-8">
        <PageHeader eyebrow="عملیات روزانه · پیش‌نمایش فاز ۵" title="ثبت حضور و غیاب" description="فهرست کلاس و دانش‌آموزان از ثبت‌نام‌های مؤثر خوانده می‌شود؛ ثبت حضور در فاز بعد فعال می‌شود." action={<span className="rounded-full bg-accent/15 px-3 py-1.5 text-xs font-bold text-[#8b5a08]">{workspace.date}</span>} />
        <div className="mt-6"><AttendanceWorkspace workspace={workspace} /></div>
      </main>
    </AppShell>
  );
}
