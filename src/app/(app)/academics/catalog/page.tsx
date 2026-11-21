import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { requirePageAccess } from "@/features/shell/route-access";
import { createGradeAction, createSubjectAction } from "@/features/academics/actions";
import { listGradesForContext, listSubjectsForContext } from "@/features/academics/queries";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Panel, SectionHeading } from "@/components/ui/panel";

export default async function CatalogPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const [grades, subjects] = await Promise.all([
    listGradesForContext(access.context),
    listSubjectsForContext(access.context),
  ]);

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "ساختار آموزشی", href: "/academics" }, { label: "پایه‌ها و درس‌ها" }]}
        title="پایه‌ها و درس‌ها"
        description="کاتالوگ مدرسه؛ کلاس‌ها روی همین پایه‌ها ساخته می‌شوند."
        action={<BackLink href="/academics">بازگشت به ساختار آموزشی</BackLink>}
      />

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel>
          <SectionHeading title="پایه‌ها" description={`${grades.length} پایه فعال`} />
          <form action={createGradeAction} className="mt-5 grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_6rem]">
            <Field label="کد"><Input name="code" placeholder="G1" required dir="ltr" className="text-start" /></Field>
            <Field label="نام پایه"><Input name="name" placeholder="پایه اول" required /></Field>
            <Field label="ترتیب"><Input name="sortOrder" type="number" defaultValue="0" dir="ltr" className="text-start" /></Field>
            <div className="sm:col-span-3"><Button type="submit" size="sm">افزودن پایه</Button></div>
          </form>
          <ul className="mt-6 divide-y divide-border border-t border-border">
            {grades.length === 0 ? <li className="py-4 text-sm text-muted">پایه‌ای ثبت نشده است.</li> : grades.map((grade) => (
              <li key={grade.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-bold text-primary">{grade.name}</span>
                <span className="text-xs tabular-nums text-muted">{grade.code}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <SectionHeading title="درس‌ها" description={`${subjects.length} درس فعال`} />
          <form action={createSubjectAction} className="mt-5 grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <Field label="کد"><Input name="code" placeholder="MATH" required dir="ltr" className="text-start" /></Field>
            <Field label="نام درس"><Input name="name" placeholder="ریاضی" required /></Field>
            <div className="sm:col-span-2"><Button type="submit" size="sm">افزودن درس</Button></div>
          </form>
          <ul className="mt-6 divide-y divide-border border-t border-border">
            {subjects.length === 0 ? <li className="py-4 text-sm text-muted">درسی ثبت نشده است.</li> : subjects.map((subject) => (
              <li key={subject.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-bold text-primary">{subject.name}</span>
                <span className="text-xs tabular-nums text-muted">{subject.code}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AppPage>
  );
}
