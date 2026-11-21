"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

export function StudentFilters({ search = "", status = "" }: { search?: string; status?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(search);
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) params.set("search", query.trim());
    else params.delete("search");
    if (selectedStatus) params.set("status", selectedStatus);
    else params.delete("status");
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
      <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
        {isPending ? "در حال جست‌وجو…" : "جست‌وجو"}
      </Button>
    </form>
  );
}
