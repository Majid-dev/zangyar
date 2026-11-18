import { headers } from "next/headers";

import { createClassroomAction } from "@/features/academics/actions";
import { listAcademicYears, listClassrooms, listGrades } from "@/features/academics/queries";

export default async function ClassroomsPage() {
  const requestHeaders = await headers();
  const [years, grades] = await Promise.all([listAcademicYears({ headers: requestHeaders }), listGrades({ headers: requestHeaders })]);
  const classrooms = await listClassrooms({ headers: requestHeaders });

  return <main className="mx-auto max-w-5xl p-6"><h1 className="text-3xl font-black text-primary">کلاس‌ها</h1><form action={createClassroomAction} className="mt-6 grid gap-3 rounded-3xl bg-surface p-6 shadow-sm ring-1 ring-border sm:grid-cols-2"><select name="academicYearId" required defaultValue=""><option value="" disabled>سال تحصیلی</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select><select name="gradeId" required defaultValue=""><option value="" disabled>پایه</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select><input name="code" placeholder="کد کلاس" required /><input name="name" placeholder="نام کلاس" required /><input name="capacity" type="number" placeholder="ظرفیت" /><button className="button-primary sm:col-span-2" type="submit">ایجاد کلاس</button></form><div className="mt-6 space-y-3">{classrooms.map((classroom) => <article className="rounded-2xl bg-surface p-5 ring-1 ring-border" key={classroom.id}><h2 className="font-black text-primary">{classroom.name}</h2><p className="mt-1 text-sm text-muted">{classroom.code} · ظرفیت {classroom.capacity ?? "—"}</p></article>)}</div></main>;
}
