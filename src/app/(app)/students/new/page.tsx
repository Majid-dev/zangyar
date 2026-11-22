import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { listAcademicYearsForContext, listClassroomsForContext } from "@/features/academics/queries";
import { StudentRegistrationWizard } from "@/features/students/components/student-registration-wizard";

export default async function NewStudentPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const [years, classrooms] = await Promise.all([
    listAcademicYearsForContext(access.context),
    listClassroomsForContext(access.context),
  ]);

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "دانش‌آموزان", href: "/students" }, { label: "ثبت پرونده جدید" }]}
        title="ثبت پرونده دانش‌آموز"
        description="پروفایل، اولیا و ثبت‌نام تحصیلی را در یک تراکنش امن و tenant-scoped ثبت کنید."
        action={<BackLink href="/students">بازگشت به دانش‌آموزان</BackLink>}
      />
      <div className="mt-6">
        <StudentRegistrationWizard
          years={years.filter((year) => year.status !== "CLOSED" && year.status !== "ARCHIVED").map((year) => ({ id: year.id, name: year.name, code: year.code, status: year.status }))}
          classrooms={classrooms.map((classroom) => ({ id: classroom.id, name: classroom.name, code: classroom.code, academicYearId: classroom.academicYearId }))}
        />
      </div>
    </AppPage>
  );
}
