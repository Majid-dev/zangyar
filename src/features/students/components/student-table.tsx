import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import type { StudentListRow } from "../queries";

const statusLabels = {
  ACTIVE: "فعال",
  WITHDRAWN: "ترک‌تحصیل",
  GRADUATED: "فارغ‌التحصیل",
  ARCHIVED: "بایگانی‌شده",
} as const;

export function StudentTable({ rows, total, page, pageSize, search }: { rows: StudentListRow[]; total: number; page: number; pageSize: number; search?: string }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const previous = new URLSearchParams({ ...(search ? { search } : {}), page: String(Math.max(1, page - 1)) });
  const next = new URLSearchParams({ ...(search ? { search } : {}), page: String(Math.min(pageCount, page + 1)) });

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <form className="flex min-w-0 flex-1 gap-2" method="get">
          <label className="min-w-0 flex-1"><span className="sr-only">جست‌وجوی دانش‌آموز</span><Input name="search" defaultValue={search} placeholder="جست‌وجوی نام یا کد" /></label>
          <Select name="status" className="w-36"><option value="">همه وضعیت‌ها</option><option value="ACTIVE">فعال</option><option value="WITHDRAWN">ترک‌تحصیل</option><option value="GRADUATED">فارغ‌التحصیل</option><option value="ARCHIVED">بایگانی‌شده</option></Select>
          <Button type="submit" size="sm" variant="secondary">جست‌وجو</Button>
        </form>
        <Button type="button" size="sm" disabled>افزودن دانش‌آموز</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-start text-sm">
          <thead className="bg-sage/50 text-xs text-muted"><tr><th className="px-5 py-3 font-bold">دانش‌آموز</th><th className="px-4 py-3 font-bold">کلاس</th><th className="px-4 py-3 font-bold">ولی اصلی</th><th className="px-4 py-3 font-bold">وضعیت</th><th className="px-5 py-3 text-end font-bold">عملیات</th></tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((student) => <tr key={student.id} className="hover:bg-sage/25"><td className="px-5 py-4"><p className="font-bold text-primary">{student.firstName} {student.lastName}</p><p className="mt-0.5 text-xs text-muted">کد {student.admissionNumber}</p></td><td className="px-4 py-4 text-muted">{student.classroomName ?? "بدون کلاس"}</td><td className="px-4 py-4 text-xs text-muted">{student.guardianName ? `${student.guardianName}${student.guardianMobile ? ` · ${student.guardianMobile}` : ""}` : "ثبت نشده"}</td><td className="px-4 py-4"><Badge tone={student.status === "ACTIVE" ? "success" : "warning"}>{statusLabels[student.status]}</Badge></td><td className="px-5 py-4 text-end"><Link href={`/students/${student.id}`} className="text-xs font-bold text-secondary hover:text-primary">نمایش پرونده</Link></td></tr>)}
            {rows.length === 0 ? <tr><td colSpan={5} className="p-10 text-center text-sm text-muted">دانش‌آموزی با این فیلتر پیدا نشد.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted"><span>نمایش {rows.length} از {total} دانش‌آموز</span><div className="flex gap-1"><Link href={`?${previous}`} className="flex size-8 items-center justify-center rounded-lg bg-sage font-bold text-primary" aria-label="صفحه قبل">›</Link><span className="flex size-8 items-center justify-center rounded-lg bg-primary font-bold text-white" aria-current="page">{page}</span><Link href={`?${next}`} className="flex size-8 items-center justify-center rounded-lg hover:bg-sage" aria-label="صفحه بعد">‹</Link></div></div>
    </Panel>
  );
}
