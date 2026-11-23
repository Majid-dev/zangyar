import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { requirePageAccess } from "@/features/shell/route-access";
import { TeacherCreateForm } from "@/features/teachers/components/teacher-create-form";

export default async function NewTeacherPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "دبیران", href: "/teachers" }, { label: "افزودن دبیر" }]}
        title="افزودن دبیر"
        description="حساب دبیر با نام و شماره همراه ساخته می‌شود؛ گذرواژه را خود دبیر از پیوند فعال‌سازی تعیین می‌کند."
        action={<BackLink href="/teachers">بازگشت به دبیران</BackLink>}
      />

      <div className="mt-6 max-w-3xl">
        <Panel>
          <SectionHeading
            title="اطلاعات دبیر"
            description="تا زمانی که دبیر فعال‌سازی را کامل نکند، امکان ورود به سامانه را ندارد."
          />
          <div className="mt-5">
            <TeacherCreateForm />
          </div>
        </Panel>
      </div>
    </AppPage>
  );
}
