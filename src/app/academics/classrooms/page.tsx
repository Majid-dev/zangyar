import { assignTeacherAction, createClassroomAction } from "@/features/academics/actions";
import { listAcademicYearsForContext, listClassroomsWithTeachersForContext, listGradesForContext, listSubjectsForContext, listTeacherMembershipsForContext } from "@/features/academics/queries";

import { requirePageAccess } from "../_components/route-access";

export default async function ClassroomsPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;

  const [years, grades, subjects, teachers, classroomsWithTeachers] = await Promise.all([
    listAcademicYearsForContext(access.context),
    listGradesForContext(access.context),
    listSubjectsForContext(access.context),
    listTeacherMembershipsForContext(access.context),
    listClassroomsWithTeachersForContext(access.context),
  ]);

  return <main className="mx-auto max-w-6xl p-6"><h1 className="text-3xl font-black text-primary">کلاس‌ها و دبیران</h1><form action={createClassroomAction} className="mt-6 grid gap-3 rounded-3xl bg-surface p-6 shadow-sm ring-1 ring-border sm:grid-cols-2"><select name="academicYearId" required defaultValue=""><option value="" disabled>سال تحصیلی</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select><select name="gradeId" required defaultValue=""><option value="" disabled>پایه</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select><input name="code" placeholder="کد کلاس" required /><input name="name" placeholder="نام کلاس" required /><input name="capacity" type="number" placeholder="ظرفیت" /><button className="button-primary sm:col-span-2" type="submit">ایجاد کلاس</button></form><div className="mt-6 space-y-4">{classroomsWithTeachers.map(({ classroom, assignments }) => <article className="rounded-2xl bg-surface p-5 ring-1 ring-border" key={classroom.id}><div><h2 className="font-black text-primary">{classroom.name}</h2><p className="mt-1 text-sm text-muted">{classroom.code} · ظرفیت {classroom.capacity ?? "—"}</p></div><form action={assignTeacherAction} className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2"><input type="hidden" name="classroomId" value={classroom.id} /><select name="teacherMembershipId" required defaultValue=""><option value="" disabled>انتخاب دبیر</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.userName} — {teacher.userEmail}</option>)}</select><select name="subjectId" defaultValue=""><option value="">همه درس‌ها</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><input name="startDate" type="date" required /><input name="endDate" type="date" /><label className="flex items-center gap-2 text-sm font-bold text-primary"><input name="isPrimary" type="checkbox" className="size-4" /> دبیر اصلی</label><button className="button-secondary" type="submit">تخصیص دبیر</button></form><ul className="mt-4 space-y-2">{assignments.map(({ assignment, teacher, membership }) => <li className="rounded-xl bg-background p-3 text-sm" key={assignment.id}>{teacher.name} · {membership.role} · {assignment.startDate}{assignment.endDate ? ` تا ${assignment.endDate}` : ""}{assignment.subjectId ? " · درس تخصصی" : " · همه درس‌ها"}</li>)}</ul></article>)}</div></main>;
}
