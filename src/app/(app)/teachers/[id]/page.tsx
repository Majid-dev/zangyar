import { notFound } from "next/navigation";

import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { requirePageAccess } from "@/features/shell/route-access";
import { getTeacherForContext, listTeacherInvitationsForContext } from "@/features/teachers/queries";
import { InvitationPanel, TeacherProfileCard } from "@/features/teachers/components/teacher-profile-panels";

export default async function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const { id } = await params;

  // Tenant-scoped: an id from another school simply does not resolve.
  const teacher = await getTeacherForContext(access.context, id);
  if (!teacher) notFound();

  const history = await listTeacherInvitationsForContext(access.context, teacher.teacherId);
  // An account that already has a credential has nothing left to invite; the
  // server refuses it too, so the control is hidden rather than left to fail.
  const canInvite = teacher.accountStatus !== "ACTIVE";

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "دبیران", href: "/teachers" }, { label: `${teacher.firstName} ${teacher.lastName}` }]}
        title={`${teacher.firstName} ${teacher.lastName}`}
        description={teacher.personnelCode ? `کد پرسنلی ${teacher.personnelCode}` : "بدون کد پرسنلی"}
        action={<BackLink href="/teachers">بازگشت به دبیران</BackLink>}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel>
          <SectionHeading title="اطلاعات دبیر" description="نام و کد پرسنلی او در همین مدرسه؛ حساب کاربری با شماره همراه شناسایی می‌شود." />
          <div className="mt-5">
            <TeacherProfileCard
              teacher={{
                teacherId: teacher.teacherId,
                firstName: teacher.firstName,
                lastName: teacher.lastName,
                personnelCode: teacher.personnelCode,
                maskedMobile: teacher.maskedMobile,
                membershipStatus: teacher.membershipStatus,
                accountStatus: teacher.accountStatus,
                invitationStatus: teacher.invitationStatus,
              }}
            />
          </div>
        </Panel>

        <Panel className="self-start">
          <SectionHeading title="دعوت و فعال‌سازی" description="پیوند فعال‌سازی یک‌بارمصرف است و با هر ارسال دوباره، پیوند قبلی باطل می‌شود." />
          <div className="mt-5">
            <InvitationPanel
              teacherId={teacher.teacherId}
              invitation={teacher.invitationStatus === "NONE" ? null : { id: teacher.teacherId, status: teacher.invitationStatus, expiresAt: teacher.invitationExpiresAt ?? new Date() }}
              history={history}
              canInvite={canInvite}
            />
          </div>
        </Panel>
      </div>
    </AppPage>
  );
}
