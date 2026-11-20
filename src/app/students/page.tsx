import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/app/academics/_components/route-access";
import { listStudentsForContext } from "@/features/students/queries";
import { studentListFilterSchema } from "@/features/students/schema";
import { StudentTable } from "@/features/students/components/student-table";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const params = await searchParams;
  const filters = studentListFilterSchema.parse({
    search: typeof params.search === "string" ? params.search : undefined,
    status: typeof params.status === "string" && params.status.length > 0 ? params.status : undefined,
    page: typeof params.page === "string" ? params.page : undefined,
  });
  const data = await listStudentsForContext(access.context, filters);

  return (
    <AppShell active="/students">
      <main className="mx-auto max-w-[1440px] p-4 sm:p-6 xl:p-8">
        <PageHeader eyebrow="مدیریت مدرسه" title="دانش‌آموزان" description="فهرست tenant-safe دانش‌آموزان مدرسه و وضعیت ثبت‌نام آن‌ها." action={<span className="rounded-full bg-sage px-3 py-1.5 text-xs font-bold text-primary">{data.total} دانش‌آموز</span>} />
        <div className="mt-6"><StudentTable {...data} search={filters.search} /></div>
      </main>
    </AppShell>
  );
}
