"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { formatPersianDateShort } from "@/lib/date";

import type { TeacherListRow } from "../queries";
import { INVITATION_STATUS_LABELS } from "../status";

type SortField = "name" | "mobile" | "status" | "invitation" | "personnel";
type Direction = "asc" | "desc";

const MEMBERSHIP_STATUS_LABELS: Record<"ACTIVE" | "SUSPENDED" | "REVOKED", string> = {
  ACTIVE: "فعال",
  SUSPENDED: "غیرفعال",
  REVOKED: "لغو‌شده",
};

const MEMBERSHIP_STATUS_TONES: Record<"ACTIVE" | "SUSPENDED" | "REVOKED", "success" | "neutral" | "danger"> = {
  ACTIVE: "success",
  SUSPENDED: "neutral",
  REVOKED: "danger",
};

/**
 * Digits are rendered in Persian and grouped as `0912 345 6789`, but the value is
 * kept `dir="ltr"` and only the runs are Persian, so the number reads left-to-right
 * the way a phone number does while still matching the surrounding script.
 */
function formatMobileForDisplay(mobile: string | null) {
  if (!mobile) return null;
  const groups = [mobile.slice(0, 4), mobile.slice(4, 7), mobile.slice(7)].filter((part) => part.length > 0);
  return groups.map((part) => toPersianDigits(part)).join(" ");
}

function toPersianDigits(value: string) {
  return value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

type TeacherTableProps = {
  rows: TeacherListRow[];
  total: number;
  page: number;
  pageSize: number;
  name?: string;
  mobile?: string;
  personnelCode?: string;
  membershipStatus?: string;
  invitationStatus?: string;
  sort?: SortField;
  dir?: Direction;
};

/**
 * Teachers data table.
 *
 * Each column owns the filter for the field it shows, and every control writes to
 * the URL, so filtering is a soft navigation, is shareable, and always returns to
 * the first page. Account state and invitation state are shown as separate axes
 * because they mean different things: one is school access, the other is whether
 * the teacher ever finished activating.
 */
export function TeacherTable({
  rows,
  total,
  page,
  pageSize,
  name = "",
  mobile = "",
  personnelCode = "",
  membershipStatus,
  invitationStatus,
  sort = "name",
  dir = "asc",
}: TeacherTableProps) {
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
          <p className="text-sm font-black text-primary">فهرست دبیران</p>
          {isPending ? <span className="text-xs font-bold text-secondary" role="status">در حال به‌روزرسانی…</span> : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted" aria-live="polite">{total} دبیر</span>
          <Link href="/teachers/new" className="inline-flex min-h-9 items-center justify-center rounded-xl bg-primary px-3 text-xs font-bold text-white transition hover:bg-primary/90">افزودن دبیر</Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-start text-sm" dir="rtl">
          <caption className="sr-only">فهرست دبیران مدرسه، وضعیت حساب و وضعیت دعوت</caption>
          <thead className="bg-sage/50 text-xs text-muted">
            <tr>
              <HeaderCell label="دبیر" sortField="name" sort={sort} dir={dir} onSort={sortBy}>
                <TextFilter label="نام دبیر" placeholder="نام یا نام خانوادگی" value={name} onSubmit={(value) => updateParams({ name: value || null })} />
              </HeaderCell>
              <HeaderCell label="شماره همراه" sortField="mobile" sort={sort} dir={dir} onSort={sortBy} align="end">
                <TextFilter label="شماره همراه" placeholder="۰۹…" value={mobile} onSubmit={(value) => updateParams({ mobile: value || null })} dir="ltr" />
              </HeaderCell>
              <HeaderCell label="کد پرسنلی" sortField="personnel" sort={sort} dir={dir} onSort={sortBy} align="end">
                <TextFilter label="کد پرسنلی" placeholder="کد" value={personnelCode} onSubmit={(value) => updateParams({ personnelCode: value || null })} dir="ltr" />
              </HeaderCell>
              <HeaderCell label="دسترسی به مدرسه" sortField="status" sort={sort} dir={dir} onSort={sortBy}>
                <Select aria-label="فیلتر وضعیت دسترسی" value={membershipStatus ?? ""} onChange={(event) => updateParams({ membershipStatus: event.target.value || null })} className="min-h-8 px-2 text-xs">
                  <option value="">همه وضعیت‌ها</option>
                  <option value="ACTIVE">فعال</option>
                  <option value="SUSPENDED">غیرفعال</option>
                  <option value="REVOKED">لغو‌شده</option>
                </Select>
              </HeaderCell>
              <HeaderCell label="وضعیت دعوت" sortField="invitation" sort={sort} dir={dir} onSort={sortBy}>
                <Select aria-label="فیلتر وضعیت دعوت" value={invitationStatus ?? ""} onChange={(event) => updateParams({ invitationStatus: event.target.value || null })} className="min-h-8 px-2 text-xs">
                  <option value="">همه دعوت‌ها</option>
                  <option value="PENDING">در انتظار فعال‌سازی</option>
                  <option value="EXPIRED">منقضی‌شده</option>
                  <option value="REVOKED">لغو‌شده</option>
                  <option value="CONSUMED">استفاده‌شده</option>
                  <option value="NONE">بدون دعوت</option>
                </Select>
              </HeaderCell>
              <th scope="col" className="px-5 py-3 text-end align-top font-bold">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((teacher) => (
              <tr key={teacher.teacherId} className="hover:bg-sage/25">
                <td className="px-5 py-4 text-start">
                  <Link href={`/teachers/${teacher.teacherId}`} className="font-bold text-primary hover:text-secondary">
                    {teacher.firstName} {teacher.lastName}
                  </Link>
                </td>
                <td className="px-4 py-4 text-end text-xs text-muted">
                  {formatMobileForDisplay(teacher.mobile) ? (
                    // Full number, grouped and in Persian digits, rendered LTR so the
                    // digit order reads the way a phone number should. Kept as text
                    // with tabular figures so the column stays vertically aligned.
                    <span dir="ltr" className="inline-block font-bold tabular-nums text-primary">{formatMobileForDisplay(teacher.mobile)}</span>
                  ) : "ثبت نشده"}
                </td>
                <td className="px-4 py-4 text-end text-xs text-muted">{teacher.personnelCode ?? "—"}</td>
                <td className="px-4 py-4 text-start">
                  <Badge tone={MEMBERSHIP_STATUS_TONES[teacher.membershipStatus]}>{MEMBERSHIP_STATUS_LABELS[teacher.membershipStatus]}</Badge>
                </td>
                <td className="px-4 py-4 text-start text-xs text-muted">
                  {INVITATION_STATUS_LABELS[teacher.invitationStatus]}
                  {teacher.invitationExpiresAt ? <span className="mt-1 block text-[11px] text-muted/80">تا {formatPersianDateShort(toIsoDate(teacher.invitationExpiresAt))}</span> : null}
                </td>
                <td className="px-5 py-4 text-end">
                  <Link href={`/teachers/${teacher.teacherId}`} className="text-xs font-bold text-secondary hover:text-primary">مدیریت دبیر</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={6} className="p-10 text-center text-sm text-muted">دبیری با این فیلتر پیدا نشد.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted">
        <span>نمایش {rows.length} از {total} دبیر</span>
        {pageCount > 1 ? (
          <div className="flex gap-1">
            <Link href={`?${previous}`} className="flex size-8 items-center justify-center rounded-lg bg-sage font-bold text-primary" aria-label="صفحه قبل">›</Link>
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary font-bold text-white" aria-current="page">{page}</span>
            <Link href={`?${next}`} className="flex size-8 items-center justify-center rounded-lg hover:bg-sage" aria-label="صفحه بعد">‹</Link>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function toIsoDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function HeaderCell({ label, sortField, sort, dir, onSort, children, hideSort = false, align = "start" }: { label: string; sortField: SortField; sort: SortField; dir: Direction; onSort: (field: SortField) => void; children?: React.ReactNode; hideSort?: boolean; align?: "start" | "end" }) {
  const active = sort === sortField;
  return (
    <th scope="col" className={`px-4 py-3 align-top font-bold first:ps-5 ${align === "end" ? "text-end" : "text-start"}`}>
      {hideSort ? (
        <span>{label}</span>
      ) : (
        <button type="button" onClick={() => onSort(sortField)} aria-label={`مرتب‌سازی بر اساس ${label}`} className={`inline-flex items-center gap-1 font-bold transition ${active ? "text-primary" : "text-muted hover:text-primary"}`}>
          <span>{label}</span>
          <span aria-hidden="true" className={active ? "" : "opacity-30"}>{active && dir === "desc" ? "↓" : "↑"}</span>
        </button>
      )}
      {children ? <div className="mt-2 grid gap-1.5 font-normal">{children}</div> : null}
    </th>
  );
}

/**
 * Debounced column search.
 *
 * Uncontrolled on purpose: a controlled input would need an effect to follow
 * external changes from back/forward navigation, and a remount would drop focus
 * mid-typing. The DOM node stays the source of truth.
 */
function TextFilter({ label, placeholder, value, onSubmit, dir }: { label: string; placeholder: string; value: string; onSubmit: (value: string) => void; dir?: "ltr" | "rtl" }) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef(onSubmit);
  const inputId = `teacher-filter-${label}`;

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
      <Input
        id={inputId}
        name={inputId}
        defaultValue={value}
        placeholder={placeholder}
        dir={dir}
        className={`min-h-8 px-2 text-xs ${dir === "ltr" ? "text-start" : ""}`}
      />
    </form>
  );
}
