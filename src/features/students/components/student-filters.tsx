"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

export function StudentFilters({ search = "", status = "", unenrolled = false, academicYearId = "" }: { search?: string; status?: string; unenrolled?: boolean; academicYearId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(search);
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [onlyUnenrolled, setOnlyUnenrolled] = useState(unenrolled);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) params.set("search", query.trim());
    else params.delete("search");
    if (selectedStatus) params.set("status", selectedStatus);
    else params.delete("status");
    // "not enrolled in the active year" is the enrollment filter, so keeping the
    // year in the URL is what makes the flag meaningful across pagination.
    if (onlyUnenrolled && academicYearId) {
      params.set("unenrolled", "true");
      params.set("academicYearId", academicYearId);
    } else {
      params.delete("unenrolled");
      params.delete("academicYearId");
    }
    params.delete("page");

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <form className="flex min-w-0 flex-1 gap-2" onSubmit={submit} role="search">
      <label className="min-w-0 flex-1">
        <span className="sr-only">جست‌وجوی دانش‌آموز</span>
        <Input name="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام یا کد" />
      </label>
      <Select name="status" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} className="w-36">
        <option value="">همه وضعیت‌ها</option>
        <option value="ACTIVE">فعال</option>
        <option value="WITHDRAWN">ترک‌تحصیل</option>
        <option value="GRADUATED">فارغ‌التحصیل</option>
        <option value="ARCHIVED">بایگانی‌شده</option>
      </Select>
      <label className="flex shrink-0 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold text-primary">
        <input type="checkbox" checked={onlyUnenrolled} onChange={(event) => setOnlyUnenrolled(event.target.checked)} className="size-4" disabled={!academicYearId} />
        بدون ثبت‌نام سال فعال
      </label>
      <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
        {isPending ? "در حال جست‌وجو…" : "جست‌وجو"}
      </Button>
    </form>
  );
}
