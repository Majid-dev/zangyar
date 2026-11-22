import Link from "next/link";

import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { listAcademicYearsForContext, listClassroomsForContext } from "@/features/academics/queries";
import { listStudentsForContext } from "@/features/students/queries";
import { studentListFilterSchema } from "@/features/students/schema";
import { StudentTable } from "@/features/students/components/student-table";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const params = await searchParams;
  const years = await listAcademicYearsForContext(access.context);
  const activeYear = years.find((year) => year.status === "ACTIVE") ?? null;
  const filters = studentListFilterSchema.parse({
    name: typeof params.name === "string" ? params.name : undefined,
    admission: typeof params.admission === "string" ? params.admission : undefined,
    guardian: typeof params.guardian === "string" ? params.guardian : undefined,
    // Keep old shared links functional while new filters use their own columns.
    search: typeof params.search === "string" ? params.search : undefined,
    status: typeof params.status === "string" && params.status.length > 0 ? params.status : undefined,
    page: typeof params.page === "string" ? params.page : undefined,
    classroomId: typeof params.classroomId === "string" ? params.classroomId : undefined,
    academicYearId: typeof params.academicYearId === "string" ? params.academicYearId : params.unenrolled === "true" ? activeYear?.id : undefined,
    unenrolled: params.unenrolled === "true",
    sort: typeof params.sort === "string" ? params.sort : undefined,
    dir: typeof params.dir === "string" ? params.dir : undefined,
  });
  const [data, classrooms] = await Promise.all([
    listStudentsForContext(access.context, filters),
    listClassroomsForContext(access.context, filters.academicYearId),
  ]);
  // Reached from a class row: keep the selected class visible and offer a way
  // back to the unfiltered list without relying on browser history.
  const selectedClassroom = filters.classroomId ? classrooms.find((classroom) => classroom.id === filters.classroomId) ?? null : null;

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "دانش‌آموزان" }]}
        title="دانش‌آموزان"
        description="فهرست دانش‌آموزان مدرسه، کلاس فعلی و وضعیت پرونده."
        action={<div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-sage px-3 py-1.5 text-xs font-bold text-primary">{data.total} دانش‌آموز</span><BackLink href="/dashboard">بازگشت به داشبورد</BackLink></div>}
      />
      {selectedClassroom ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-secondary/25 bg-secondary/8 p-4">
          <p className="text-sm font-bold text-primary">دانش‌آموزان کلاس {selectedClassroom.name}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
            <Link href={`/students?academicYearId=${filters.academicYearId ?? ""}`} className="text-secondary hover:text-primary">حذف فیلتر کلاس</Link>
            <Link href="/academics/classrooms" className="text-muted hover:text-primary">بازگشت به کلاس‌ها</Link>
          </div>
        </div>
      ) : null}
      <div className="mt-6">
        <StudentTable {...data} name={filters.name} admission={filters.admission} guardian={filters.guardian} status={filters.status} classroomId={filters.classroomId} unenrolled={filters.unenrolled} activeYearId={activeYear?.id} activeYearName={activeYear?.name} classrooms={classrooms.map((classroom) => ({ id: classroom.id, name: classroom.name }))} sort={filters.sort} dir={filters.dir} />
      </div>
    </AppPage>
  );
}
