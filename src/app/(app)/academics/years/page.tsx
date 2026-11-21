import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { createAcademicYearAction, transitionAcademicYearAction } from "@/features/academics/actions";
import { listAcademicYearsForContext } from "@/features/academics/queries";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { formatPersianDate } from "@/lib/date";

const statusLabels = { DRAFT: "پیش‌نویس", ACTIVE: "فعال", CLOSED: "بسته‌شده", ARCHIVED: "بایگانی" } as const;
const statusTones = { DRAFT: "neutral", ACTIVE: "success", CLOSED: "info", ARCHIVED: "warning" } as const;

export default async function AcademicYearsPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const years = await listAcademicYearsForContext(access.context);

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "ساختار آموزشی", href: "/academics" }, { label: "سال‌های تحصیلی" }]}
        title="سال‌های تحصیلی"
        description="برای هر مدرسه تنها یک سال تحصیلی می‌تواند فعال باشد. تاریخ‌ها به میلادی ذخیره و در تقویم شمسی نمایش داده می‌شوند."
        action={<BackLink href="/academics">بازگشت به ساختار آموزشی</BackLink>}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel className="order-2 lg:order-1">
          <SectionHeading title="سال‌های ثبت‌شده" description={`${years.length} سال تحصیلی`} />
          <div className="mt-5 divide-y divide-border">
            {years.length === 0 ? (
              <p className="py-6 text-sm text-muted">هنوز سال تحصیلی ثبت نشده است.</p>
            ) : years.map((year) => (
              <article key={year.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-black text-primary">{year.name}</h2>
                    <Badge tone={statusTones[year.status]}>{statusLabels[year.status]}</Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">کد {year.code} · {formatPersianDate(year.startDate)} تا {formatPersianDate(year.endDate)}</p>
                </div>
                <div className="flex gap-2">
                  {year.status === "DRAFT" ? (
                    <ActionForm action={transitionAcademicYearAction}>
                      <input type="hidden" name="academicYearId" value={year.id} />
                      <input type="hidden" name="status" value="ACTIVE" />
                      <SubmitButton size="sm" variant="secondary" pendingLabel="در حال فعال‌سازی…">فعال‌سازی</SubmitButton>
                    </ActionForm>
                  ) : null}
                  {year.status === "ACTIVE" ? (
                    <ActionForm action={transitionAcademicYearAction}>
                      <input type="hidden" name="academicYearId" value={year.id} />
                      <input type="hidden" name="status" value="CLOSED" />
                      <SubmitButton size="sm" variant="ghost" pendingLabel="در حال بستن…">بستن سال</SubmitButton>
                    </ActionForm>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <Panel className="order-1 self-start lg:order-2">
          <SectionHeading title="سال تحصیلی جدید" description="تاریخ‌ها با تقویم شمسی انتخاب می‌شوند." />
          <ActionForm action={createAcademicYearAction} className="mt-5 grid gap-4">
            <Field label="کد" name="code"><Input name="code" placeholder="1405" required dir="ltr" className="text-start" /></Field>
            <Field label="نام سال" name="name"><Input name="name" placeholder="سال تحصیلی ۱۴۰۵–۱۴۰۶" required /></Field>
            <Field label="تاریخ شروع" name="startDate"><JalaliDatePicker name="startDate" required /></Field>
            <Field label="تاریخ پایان" name="endDate"><JalaliDatePicker name="endDate" required /></Field>
            <div>
              <SubmitButton className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-[0_8px_18px_rgba(23,59,87,0.16)] transition-colors hover:bg-primary/90" pendingLabel="در حال ایجاد…">
                ایجاد سال تحصیلی
              </SubmitButton>
            </div>
          </ActionForm>
        </Panel>
      </div>
    </AppPage>
  );
}
