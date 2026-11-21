import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { StudentCreateForm } from "@/features/students/components/student-create-form";

export default async function NewStudentPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "دانش‌آموزان", href: "/students" }, { label: "ثبت دانش‌آموز جدید" }]}
        title="ثبت دانش‌آموز جدید"
        description="پرونده‌ی پایه را ثبت کنید و سپس اطلاعات ولی و ثبت‌نام کلاس را تکمیل کنید."
        action={<BackLink href="/students">بازگشت به دانش‌آموزان</BackLink>}
      />
      <div className="mt-6">
        <StudentCreateForm />
      </div>
    </AppPage>
  );
}
