import { headers } from "next/headers";

import { createGradeAction, createSubjectAction } from "@/features/academics/actions";
import { listGrades, listSubjects } from "@/features/academics/queries";

export default async function CatalogPage() {
  const requestHeaders = await headers();
  const [grades, subjects] = await Promise.all([listGrades({ headers: requestHeaders }), listSubjects({ headers: requestHeaders })]);
  return <main className="mx-auto max-w-5xl p-6"><h1 className="text-3xl font-black text-primary">پایه‌ها و درس‌ها</h1><div className="mt-6 grid gap-5 md:grid-cols-2"><section className="rounded-3xl bg-surface p-6 ring-1 ring-border"><h2 className="text-xl font-black">پایه‌ها</h2><form action={createGradeAction} className="mt-4 space-y-3"><input name="code" placeholder="کد پایه" required /><input name="name" placeholder="نام پایه" required /><input name="sortOrder" type="number" defaultValue="0" /><button className="button-primary" type="submit">افزودن پایه</button></form><ul className="mt-6 space-y-2">{grades.map((grade) => <li className="rounded-xl bg-background p-3 text-sm" key={grade.id}>{grade.code} — {grade.name}</li>)}</ul></section><section className="rounded-3xl bg-surface p-6 ring-1 ring-border"><h2 className="text-xl font-black">درس‌ها</h2><form action={createSubjectAction} className="mt-4 space-y-3"><input name="code" placeholder="کد درس" required /><input name="name" placeholder="نام درس" required /><button className="button-primary" type="submit">افزودن درس</button></form><ul className="mt-6 space-y-2">{subjects.map((subject) => <li className="rounded-xl bg-background p-3 text-sm" key={subject.id}>{subject.code} — {subject.name}</li>)}</ul></section></div></main>;
}
