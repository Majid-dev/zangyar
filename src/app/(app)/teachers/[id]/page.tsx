import { notFound } from "next/navigation";

import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { requirePageAccess } from "@/features/shell/route-access";
import { getActiveAcademicYear, getTeacherForContext } from "@/features/teachers/queries";
import { TeacherProfileCard } from "@/features/teachers/components/teacher-profile-panels";

export default async function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const { id } = await params;

  // Tenant-scoped: an id from another school simply does not resolve.
  const teacher = await getTeacherForContext(access.context, id);
  if (!teacher) notFound();

  // Hours are recorded against the school's active academic year, so whether one
  // exists decides whether the hours control can do anything.
  const activeYear = await getActiveAcademicYear(access.context);

  const displayName = teacher.firstName && teacher.lastName ? `${teacher.firstName} ${teacher.lastName}` : null;

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[
          { label: "داشبورد", href: "/dashboard" },
          { label: "دبیران", href: "/teachers" },
          { label: displayName ?? teacher.phoneNumber },
        ]}
        title={displayName ?? teacher.phoneNumber}
        description={displayName ? undefined : "این شماره همراه هنوز ثبت‌نام نکرده است."}
        action={<BackLink href="/teachers">بازگشت به دبیران</BackLink>}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel>
          <SectionHeading
            title="اطلاعات دبیر"
            description="شماره همراه، مشخصاتی که دبیر هنگام ثبت‌نام وارد کرده، و تصمیم تأیید ثبت‌نام."
          />
          <div className="mt-5">
            <TeacherProfileCard teacher={teacher} hasActiveAcademicYear={activeYear !== null} />
          </div>
        </Panel>

        <Panel className="self-start">
          <SectionHeading title="راهنمای تأیید" description="دبیر پس از ثبت‌نام تا زمان تأیید شما به منابع مدرسه دسترسی ندارد." />
          <ol className="mt-4 list-disc space-y-2 pe-4 text-xs leading-6 text-muted">
            <li>شماره همراه را ثبت می‌کنید. تا پیش از ثبت‌نام می‌توانید آن را اصلاح یا حذف کنید.</li>
            <li>دبیر از صفحه‌ی ثبت‌نام، شماره را با کد تأیید اثبات می‌کند و نام و گذرواژه‌اش را تعیین می‌کند.</li>
            <li>ثبت‌نام او در انتظار تأیید شما می‌ماند.</li>
            <li>در پنجره‌ی تأیید، ساعت موظفی هفتگی او را تعیین می‌کنید؛ تأیید و ثبت این ساعت با هم انجام می‌شود.</li>
            <li>تا زمانی که ساعت موظفی تعیین نشود، امکان تخصیص زنگ به دبیر وجود ندارد.</li>
            <li>با غیرفعال‌سازی، دسترسی قطع و پرونده و ساعت موظفی او نگه داشته می‌شود.</li>
          </ol>
        </Panel>
      </div>
    </AppPage>
  );
}
