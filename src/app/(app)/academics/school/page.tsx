import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { updateSchoolConfigurationAction } from "@/features/academics/actions";
import { getSchoolConfiguration } from "@/features/academics/queries";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";

export default async function SchoolSettingsPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const data = await getSchoolConfiguration({ headers: access.headers });

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "ساختار آموزشی", href: "/academics" }, { label: "تنظیمات مدرسه" }]}
        title="تنظیمات مدرسه"
        description="پروفایل مدرسه و منطقه زمانی مبنای محاسبه‌ی تاریخ کاری روزانه است."
        action={<BackLink href="/academics">بازگشت به ساختار آموزشی</BackLink>}
      />
      <div className="mt-6 max-w-3xl">
        <Panel>
          <ActionForm action={updateSchoolConfigurationAction} className="grid gap-5">
            <Field label="نام مدرسه" name="name"><Input name="name" defaultValue={data.school.name} required /></Field>
            <Field label="منطقه زمانی" name="timezone" hint="پیش‌فرض Asia/Tehran"><Input name="timezone" defaultValue={data.school.timezone} required dir="ltr" className="text-start" /></Field>
            <Field label="تلفن" name="phone" hint="اختیاری"><Input name="phone" defaultValue={data.school.phone ?? ""} inputMode="tel" dir="ltr" className="text-start" /></Field>
            <Field label="نشانی" name="address" hint="اختیاری"><Textarea name="address" defaultValue={data.school.address ?? ""} /></Field>
            <div>
              <SubmitButton className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-[0_8px_18px_rgba(23,59,87,0.16)] transition-colors hover:bg-primary/90">
                ذخیره تنظیمات
              </SubmitButton>
            </div>
          </ActionForm>
        </Panel>
      </div>
    </AppPage>
  );
}
