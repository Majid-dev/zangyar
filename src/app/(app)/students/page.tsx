import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
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
    classroomId: typeof params.classroomId === "string" ? params.classroomId : undefined,
    academicYearId: typeof params.academicYearId === "string" ? params.academicYearId : undefined,
  });
  const data = await listStudentsForContext(access.context, filters);

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "دانش‌آموزان" }]}
        title="دانش‌آموزان"
        description="فهرست دانش‌آموزان مدرسه، کلاس فعلی و وضعیت پرونده."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sage px-3 py-1.5 text-xs font-bold text-primary">{data.total} دانش‌آموز</span>
            <BackLink href="/dashboard">بازگشت به داشبورد</BackLink>
          </div>
        }
      />
      <div className="mt-6">
        <StudentTable {...data} search={filters.search} status={filters.status} classroomId={filters.classroomId} academicYearId={filters.academicYearId} />
      </div>
    </AppPage>
  );
}
