import { AppShell } from "@/components/layout/app-shell";
import { PageHeader, BackLink } from "@/components/layout/page-header";
import { requirePageAccess } from "@/app/academics/_components/route-access";
import { getStudentForContext, listStudentEnrollmentsForContext, listStudentGuardiansForContext } from "@/features/students/queries";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionHeading } from "@/components/ui/panel";

const statusLabels = { ACTIVE: "فعال", WITHDRAWN: "ترک‌تحصیل", GRADUATED: "فارغ‌التحصیل", ARCHIVED: "بایگانی‌شده" } as const;

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const { id } = await params;
  const student = await getStudentForContext(access.context, id);
  const [guardians, enrollments] = await Promise.all([
    listStudentGuardiansForContext(access.context, student.id),
    listStudentEnrollmentsForContext(access.context, student.id),
  ]);

  return (
    <AppShell active="/students">
      <main className="mx-auto max-w-[1100px] p-4 sm:p-6 xl:p-8">
        <PageHeader eyebrow="پرونده دانش‌آموز" title={`${student.firstName} ${student.lastName}`} description={`کد دانش‌آموزی ${student.admissionNumber}`} action={<BackLink href="/students">بازگشت به دانش‌آموزان</BackLink>} />
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <Panel><SectionHeading title="اطلاعات پایه" /><dl className="mt-5 grid gap-4 sm:grid-cols-3"><div><dt className="text-xs text-muted">وضعیت</dt><dd className="mt-1"><Badge tone={student.status === "ACTIVE" ? "success" : "warning"}>{statusLabels[student.status]}</Badge></dd></div><div><dt className="text-xs text-muted">کد ملی</dt><dd className="mt-1 text-sm font-bold text-primary">{student.nationalId ?? "ثبت نشده"}</dd></div><div><dt className="text-xs text-muted">تاریخ تولد</dt><dd className="mt-1 text-sm font-bold text-primary">{student.birthDate ?? "ثبت نشده"}</dd></div></dl></Panel>
            <Panel><SectionHeading title="تاریخچه ثبت‌نام" description="بازه‌های مؤثر کلاس و سال تحصیلی." /><div className="mt-5 divide-y divide-border">{enrollments.length === 0 ? <p className="text-sm text-muted">ثبت‌نامی ثبت نشده است.</p> : enrollments.map(({ enrollment, classroom, academicYear }) => <div key={enrollment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"><div><p className="text-sm font-bold text-primary">{classroom.name}</p><p className="mt-1 text-xs text-muted">{academicYear.name} · {enrollment.startDate} تا {enrollment.endDate ?? "اکنون"}</p></div><Badge tone={enrollment.status === "ACTIVE" ? "success" : "neutral"}>{enrollment.status === "ACTIVE" ? "فعال" : "بسته"}</Badge></div>)}</div></Panel>
          </div>
          <Panel><SectionHeading title="اولیا" description="اطلاعات تماس این پرونده." /><div className="mt-5 space-y-4">{guardians.length === 0 ? <p className="text-sm text-muted">ولی ثبت نشده است.</p> : guardians.map(({ guardian, relationship }) => <div key={guardian.id} className="border-b border-border pb-3 last:border-0 last:pb-0"><p className="text-sm font-bold text-primary">{guardian.firstName} {guardian.lastName}</p><p className="mt-1 text-xs text-muted">{relationship.relationshipType ?? "رابطه ثبت نشده"}</p><p className="mt-1 text-xs text-muted">{guardian.normalizedMobile ?? "شماره ثبت نشده"}</p></div>)}</div></Panel>
        </div>
      </main>
    </AppShell>
  );
}
