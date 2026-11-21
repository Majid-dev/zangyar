import { AppShell } from "@/components/layout/app-shell";
import { PageHeader, BackLink } from "@/components/layout/page-header";
import { requirePageAccess } from "@/app/academics/_components/route-access";
import { StudentCreateForm } from "@/features/students/components/student-create-form";

export default async function NewStudentPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;

  return (
    <AppShell active="/students">
      <main className="mx-auto max-w-[1100px] p-4 sm:p-6 xl:p-8">
        <PageHeader eyebrow="مدیریت مدرسه" title="ثبت دانش‌آموز جدید" description="پرونده‌ی پایه را ثبت کنید و سپس اطلاعات ولی و ثبت‌نام کلاس را تکمیل کنید." action={<BackLink href="/students">بازگشت به دانش‌آموزان</BackLink>} />
        <div className="mt-6"><StudentCreateForm /></div>
      </main>
    </AppShell>
  );
}
