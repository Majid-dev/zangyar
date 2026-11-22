"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import type { StudentListFilter } from "../schema";
import type { StudentListRow } from "../queries";

const statusLabels = {
  ACTIVE: "فعال",
  WITHDRAWN: "ترک‌تحصیل",
  GRADUATED: "فارغ‌التحصیل",
  ARCHIVED: "بایگانی‌شده",
} as const;

type SortField = NonNullable<StudentListFilter["sort"]>;
type Direction = NonNullable<StudentListFilter["dir"]>;
type ClassroomOption = { id: string; name: string };

type StudentTableProps = {
  rows: StudentListRow[];
  total: number;
  page: number;
  pageSize: number;
  name?: string;
  admission?: string;
  guardian?: string;
  status?: StudentListFilter["status"];
  classroomId?: string;
  unenrolled?: boolean;
  activeYearId?: string | null;
  activeYearName?: string | null;
  classrooms: ClassroomOption[];
  sort?: SortField;
  dir?: Direction;
};

/**
 * Students data table.
 *
 * Each column owns the filter for the field it displays: text for names and
 * codes, a select for categorical values. Every control writes to the URL, so
 * filtering is a soft navigation, is shareable, and always resets to page 1.
 */
export function StudentTable({
  rows,
  total,
  page,
  pageSize,
  name = "",
  admission = "",
  guardian = "",
  status,
  classroomId,
  unenrolled = false,
  activeYearId,
  activeYearName,
  classrooms,
  sort = "name",
  dir = "asc",
}: StudentTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function updateParams(changes: Record<string, string | null>) {
    const params = new URLSearchParams(currentParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    startTransition(() => router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false }));
  }

  function sortBy(field: SortField) {
    updateParams({ sort: field, dir: sort === field && dir === "asc" ? "desc" : "asc" });
  }

  const previous = new URLSearchParams(currentParams.toString());
  previous.set("page", String(Math.max(1, page - 1)));
  const next = new URLSearchParams(currentParams.toString());
  next.set("page", String(Math.min(pageCount, page + 1)));

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <p className="text-sm font-black text-primary">فهرست دانش‌آموزان</p>
          {isPending ? <span className="text-xs font-bold text-secondary" role="status">در حال به‌روزرسانی…</span> : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted" aria-live="polite">{total} دانش‌آموز</span>
          <Link href="/students/new" className="inline-flex min-h-9 items-center justify-center rounded-xl bg-primary px-3 text-xs font-bold text-white transition hover:bg-primary/90">افزودن دانش‌آموز</Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-start text-sm" dir="rtl">
          <caption className="sr-only">{unenrolled && activeYearName ? `دانش‌آموزان بدون ثبت‌نام در سال تحصیلی ${activeYearName}` : "فهرست دانش‌آموزان مدرسه"}</caption>
          <thead className="bg-sage/50 text-xs text-muted">
            <tr>
              <HeaderCell label="دانش‌آموز" align="start" sortField="name" sort={sort} dir={dir} onSort={sortBy}>
                <TextFilter label="نام دانش‌آموز" placeholder="نام یا نام خانوادگی" value={name} onSubmit={(value) => updateParams({ name: value || null })} />
              </HeaderCell>
              <HeaderCell label="کد دانش‌آموزی" align="start" sortField="admission" sort={sort} dir={dir} onSort={sortBy}>
                <TextFilter label="کد دانش‌آموزی" placeholder="کد" value={admission} onSubmit={(value) => updateParams({ admission: value || null })} />
              </HeaderCell>
              <HeaderCell label="کلاس" align="start" sortField="classroom" sort={sort} dir={dir} onSort={sortBy}>
                <Select
                  aria-label="فیلتر کلاس"
                  value={classroomId ?? ""}
                  // Choosing a class is itself the enrollment filter, so it clears
                  // the "not enrolled" flag and the year pin: leaving either behind
                  // would combine into "students NOT in the chosen class".
                  onChange={(event) => updateParams({ classroomId: event.target.value || null, unenrolled: null, academicYearId: null })}
                  className="min-h-8 px-2 text-xs"
                >
                  <option value="">همه کلاس‌ها</option>
                  {classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
                </Select>
                <label className={`mt-1.5 flex items-center gap-1 text-[10px] font-normal text-muted ${activeYearId ? "" : "opacity-60"}`}>
                  <input type="checkbox" checked={unenrolled} disabled={!activeYearId} onChange={(event) => updateParams({ unenrolled: event.target.checked ? "true" : null, academicYearId: event.target.checked ? activeYearId ?? null : null, classroomId: null })} className="size-3.5" />
                  بدون ثبت‌نام سال فعال
                </label>
              </HeaderCell>
              <HeaderCell label="ولی اصلی" align="start" sortField="guardian" sort={sort} dir={dir} onSort={sortBy}>
                <TextFilter label="نام ولی" placeholder="نام ولی" value={guardian} onSubmit={(value) => updateParams({ guardian: value || null })} />
              </HeaderCell>
              <HeaderCell label="وضعیت" align="start" sortField="status" sort={sort} dir={dir} onSort={sortBy}>
                <Select aria-label="فیلتر وضعیت" value={status ?? ""} onChange={(event) => updateParams({ status: event.target.value || null })} className="min-h-8 px-2 text-xs">
                  <option value="">همه وضعیت‌ها</option>
                  <option value="ACTIVE">فعال</option>
                  <option value="WITHDRAWN">ترک‌تحصیل</option>
                  <option value="GRADUATED">فارغ‌التحصیل</option>
                  <option value="ARCHIVED">بایگانی‌شده</option>
                </Select>
              </HeaderCell>
              <th scope="col" className="px-5 py-3 text-end align-top font-bold">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((student) => (
              <tr key={student.id} className="hover:bg-sage/25">
                <td className="px-5 py-4 text-start"><p className="font-bold text-primary">{student.firstName} {student.lastName}</p></td>
                <td className="px-4 py-4 text-start text-muted">{student.admissionNumber}</td>
                <td className="px-4 py-4 text-start text-muted">{student.classroomName ?? "بدون کلاس"}</td>
                <td className="px-4 py-4 text-start text-xs text-muted">{student.guardianName ? `${student.guardianName}${student.guardianMobile ? ` · ${student.guardianMobile}` : ""}` : "ثبت نشده"}</td>
                <td className="px-4 py-4 text-start"><Badge tone={student.status === "ACTIVE" ? "success" : "warning"}>{statusLabels[student.status]}</Badge></td>
                <td className="px-5 py-4 text-end"><Link href={`/students/${student.id}`} className="text-xs font-bold text-secondary hover:text-primary">نمایش پرونده</Link></td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={6} className="p-10 text-center text-sm text-muted">دانش‌آموزی با این فیلتر پیدا نشد.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted">
        <span>نمایش {rows.length} از {total} دانش‌آموز</span>
        <div className="flex gap-1">
          <Link href={`?${previous}`} className="flex size-8 items-center justify-center rounded-lg bg-sage font-bold text-primary" aria-label="صفحه قبل">›</Link>
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary font-bold text-white" aria-current="page">{page}</span>
          <Link href={`?${next}`} className="flex size-8 items-center justify-center rounded-lg hover:bg-sage" aria-label="صفحه بعد">‹</Link>
        </div>
      </div>
    </Panel>
  );
}

function HeaderCell({ label, align, sortField, sort, dir, onSort, children }: { label: string; align: "start" | "end"; sortField: SortField; sort: SortField; dir: Direction; onSort: (field: SortField) => void; children?: React.ReactNode }) {
  const active = sort === sortField;
  return (
    <th scope="col" className={`px-4 py-3 align-top font-bold first:ps-5 ${align === "end" ? "text-end" : "text-start"}`}>
      <button type="button" onClick={() => onSort(sortField)} aria-label={`مرتب‌سازی بر اساس ${label}`} className={`inline-flex items-center gap-1 font-bold transition ${active ? "text-primary" : "text-muted hover:text-primary"}`}>
        <span>{label}</span>
        <span aria-hidden="true" className={active ? "" : "opacity-30"}>{active && dir === "desc" ? "↓" : "↑"}</span>
      </button>
      {children ? <div className="mt-2 grid gap-1.5 font-normal">{children}</div> : null}
    </th>
  );
}

/**
 * Debounced column search.
 *
 * Uncontrolled on purpose: a controlled input would need an effect to follow
 * external value changes (back/forward), and a remount would drop focus while
 * typing. The DOM node is the source of truth, and the effect only pushes the
 * value back in when the URL changed from somewhere else.
 */
function TextFilter({ label, placeholder, value, onSubmit }: { label: string; placeholder: string; value: string; onSubmit: (value: string) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef(onSubmit);
  const inputId = `filter-${label}`;

  useEffect(() => {
    submitRef.current = onSubmit;
  }, [onSubmit]);

  useEffect(() => {
    const input = formRef.current?.elements.namedItem(inputId);
    if (input instanceof HTMLInputElement && input.value !== value) input.value = value;
  }, [value, inputId]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let timer: number | undefined;
    const read = () => {
      const input = form.elements.namedItem(inputId);
      return input instanceof HTMLInputElement ? input.value.trim() : "";
    };
    const handleInput = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => submitRef.current(read()), 350);
    };
    form.addEventListener("input", handleInput);
    function handleSubmit(event: SubmitEvent) {
      event.preventDefault();
      window.clearTimeout(timer);
      submitRef.current(read());
    }
    form.addEventListener("submit", handleSubmit);
    return () => {
      window.clearTimeout(timer);
      form.removeEventListener("input", handleInput);
      form.removeEventListener("submit", handleSubmit);
    };
  }, [inputId]);

  return (
    <form ref={formRef} onSubmit={(event) => event.preventDefault()}>
      <label className="sr-only" htmlFor={inputId}>{`فیلتر ${label}`}</label>
      <Input id={inputId} name={inputId} defaultValue={value} placeholder={placeholder} className="min-h-8 px-2 text-xs" />
    </form>
  );
}
