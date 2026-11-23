import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { listTeachersForContext } from "@/features/teachers/queries";
import { teacherListFilterSchema } from "@/features/teachers/schema";
import { TeacherTable } from "@/features/teachers/components/teacher-table";

export default async function TeachersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const params = await searchParams;

  const filters = teacherListFilterSchema.parse({
    name: typeof params.name === "string" ? params.name : undefined,
    mobile: typeof params.mobile === "string" ? params.mobile : undefined,
    personnelCode: typeof params.personnelCode === "string" ? params.personnelCode : undefined,
    membershipStatus: typeof params.membershipStatus === "string" && params.membershipStatus.length > 0 ? params.membershipStatus : undefined,
    invitationStatus: typeof params.invitationStatus === "string" && params.invitationStatus.length > 0 ? params.invitationStatus : undefined,
    sort: typeof params.sort === "string" ? params.sort : undefined,
    dir: typeof params.dir === "string" ? params.dir : undefined,
    page: typeof params.page === "string" ? params.page : undefined,
  });

  const data = await listTeachersForContext(access.context, filters);

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "دبیران" }]}
        title="دبیران"
        description="افزودن دبیر، پیگیری وضعیت دعوت و فعال‌سازی، و مدیریت دسترسی آن‌ها در این مدرسه."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sage px-3 py-1.5 text-xs font-bold text-primary">{data.total} دبیر</span>
            <BackLink href="/dashboard">بازگشت به داشبورد</BackLink>
          </div>
        }
      />

      <div className="mt-6">
        <TeacherTable
          {...data}
          name={filters.name}
          mobile={filters.mobile}
          personnelCode={filters.personnelCode}
          membershipStatus={filters.membershipStatus}
          invitationStatus={filters.invitationStatus}
          sort={filters.sort}
          dir={filters.dir}
        />
      </div>
    </AppPage>
  );
}
