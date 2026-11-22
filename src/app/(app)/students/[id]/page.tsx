import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { getStudentForContext, listStudentEnrollmentsForContext, listStudentGuardiansForContext } from "@/features/students/queries";
import { listAcademicYearsForContext, listClassroomsForContext } from "@/features/academics/queries";
import { EnrollmentPanel, GuardianPanel, StudentProfileCard } from "@/features/students/components/student-profile-panels";
import { Panel, SectionHeading } from "@/components/ui/panel";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const { id } = await params;
  const student = await getStudentForContext(access.context, id);
  const [guardianRows, enrollmentRows, years, classrooms] = await Promise.all([
    listStudentGuardiansForContext(access.context, student.id),
    listStudentEnrollmentsForContext(access.context, student.id),
    listAcademicYearsForContext(access.context),
    listClassroomsForContext(access.context),
  ]);

  const activeYears = years.filter((year) => year.status === "ACTIVE");
  const activeYearId = activeYears[0]?.id ?? null;
  // Only ACTIVE enrollments block re-enrollment; the partial exclusion constraint
  // in the database enforces the same rule, so surface the state before submit.
  const enrolledActiveYear = enrollmentRows.some(({ enrollment, academicYear }) => academicYear.status === "ACTIVE" && enrollment.status === "ACTIVE");

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "دانش‌آموزان", href: "/students" }, { label: `${student.firstName} ${student.lastName}` }]}
        title={`${student.firstName} ${student.lastName}`}
        description={`کد دانش‌آموزی ${student.admissionNumber} · پرونده مستقل از ثبت‌نام هر سال تحصیلی`}
        action={<BackLink href="/students">بازگشت به دانش‌آموزان</BackLink>}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Panel>
            <SectionHeading title="اطلاعات پایه" description="پرونده‌ی هویتی دانش‌آموز؛ در همه‌ی سال‌های تحصیلی مشترک است." />
            <div className="mt-5">
              <StudentProfileCard student={{ id: student.id, admissionNumber: student.admissionNumber, firstName: student.firstName, lastName: student.lastName, nationalId: student.nationalId, birthDate: student.birthDate, status: student.status }} />
            </div>
          </Panel>

          <Panel>
            <SectionHeading title="ثبت‌نام تحصیلی" description="هر ثبت‌نام به یک سال تحصیلی و کلاس وابسته است و در طول زمان حفظ می‌شود." />
            <div className="mt-5">
              <EnrollmentPanel
                studentId={student.id}
                years={activeYears.filter((year) => year.status !== "CLOSED" && year.status !== "ARCHIVED").map((year) => ({ id: year.id, name: year.name, code: year.code }))}
                classrooms={classrooms.map((classroom) => ({ id: classroom.id, name: classroom.name, academicYearId: classroom.academicYearId }))}
                enrollments={enrollmentRows.map(({ enrollment, classroom, academicYear }) => ({
                  id: enrollment.id,
                  classroomName: classroom.name,
                  academicYearName: `${academicYear.name} [${academicYear.code}]`,
                  startDate: enrollment.startDate,
                  endDate: enrollment.endDate,
                  status: enrollment.status,
                }))}
                activeYearId={activeYearId}
                unenrolledActiveYear={Boolean(activeYearId) && !enrolledActiveYear}
              />
            </div>
          </Panel>
        </div>

        <Panel className="self-start">
          <SectionHeading title="اولیا" description="هر دانش‌آموز می‌تواند چند ولی داشته باشد؛ یک ولی می‌تواند برای چند دانش‌آموز ثبت شود." />
          <div className="mt-5">
            <GuardianPanel
              studentId={student.id}
              guardians={guardianRows.map(({ guardian, relationship }) => ({
                id: guardian.id,
                firstName: guardian.firstName,
                lastName: guardian.lastName,
                normalizedMobile: guardian.normalizedMobile,
                email: guardian.email,
                status: guardian.status,
                relationshipType: relationship.relationshipType,
                isPrimary: relationship.isPrimary,
                receivesSms: relationship.receivesSms,
                isEmergency: relationship.isEmergency,
              }))}
            />
          </div>
        </Panel>
      </div>
    </AppPage>
  );
}
