"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { Panel, SectionHeading } from "@/components/ui/panel";

type AttendanceStatus = "present" | "absent" | "late" | "excused";
type WorkspaceStudent = { id: string; enrollmentId: string; name: string; code: string };
type AttendanceWorkspaceData = { date: string; classroom: { classroom: { name: string }; academicYear: { name: string } } | null; students: WorkspaceStudent[] };

const statusOptions: { value: AttendanceStatus; label: string; short: string; className: string }[] = [
  { value: "present", label: "حاضر", short: "ح", className: "border-success/30 bg-success/10 text-success" },
  { value: "absent", label: "غایب", short: "غ", className: "border-danger/30 bg-danger/10 text-danger" },
  { value: "late", label: "تأخیر", short: "ت", className: "border-warning/30 bg-warning/15 text-[#8b5a08]" },
  { value: "excused", label: "موجه", short: "م", className: "border-secondary/30 bg-secondary/10 text-secondary" },
];

export function AttendanceWorkspace({ workspace }: { workspace: AttendanceWorkspaceData }) {
  const [students, setStudents] = useState(() => workspace.students.map((student) => ({ ...student, status: "present" as AttendanceStatus })));
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => students.filter((student) => student.name.includes(query) || student.code.includes(query)), [query, students]);
  const counts = useMemo(() => students.reduce<Record<AttendanceStatus, number>>((result, student) => ({ ...result, [student.status]: result[student.status] + 1 }), { present: 0, absent: 0, late: 0, excused: 0 }), [students]);

  function setAll(status: AttendanceStatus) { setStudents((current) => current.map((student) => ({ ...student, status }))); }
  function setStatus(id: string, status: AttendanceStatus) { setStudents((current) => current.map((student) => student.id === id ? { ...student, status } : student)); }

  if (!workspace.classroom) return <Panel><SectionHeading title="کلاسی برای نمایش وجود ندارد" description="برای این حساب، کلاس فعال یا ثبت‌نام مؤثری پیدا نشد." /></Panel>;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <Panel className="overflow-hidden p-0">
        <div className="border-b border-border p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><SectionHeading eyebrow="کلاس انتخاب‌شده" title={workspace.classroom.classroom.name} description={`${workspace.classroom.academicYear.name} · ${students.length} دانش‌آموز`} /><Badge tone="info">پیش‌نمایش</Badge></div><div className="mt-5 flex flex-col gap-3 sm:flex-row"><label className="relative min-w-0 flex-1"><span className="sr-only">جست‌وجوی دانش‌آموز</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام یا کد دانش‌آموز" className="pe-10" /></label><div className="flex gap-2 overflow-x-auto pb-1"><Button type="button" size="sm" variant="secondary" onClick={() => setAll("present")}>همه حاضر</Button><Button type="button" size="sm" variant="ghost" onClick={() => setAll("absent")}>همه غایب</Button></div></div></div>
        <div className="hidden grid-cols-[minmax(0,1fr)_13rem] gap-3 bg-sage/50 px-5 py-2.5 text-xs font-bold text-muted sm:grid"><span>دانش‌آموز</span><span>وضعیت حضور</span></div>
        <div className="divide-y divide-border">{filtered.map((student, index) => <div key={student.id} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sage text-xs font-black text-primary tabular-nums">{index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-primary">{student.name}</p><p className="mt-0.5 text-xs text-muted">کد {student.code}</p></div></div><div className="grid grid-cols-4 gap-1.5" role="group" aria-label={`وضعیت حضور ${student.name}`}>{statusOptions.map((option) => <button key={option.value} type="button" aria-pressed={student.status === option.value} onClick={() => setStatus(student.id, option.value)} className={`min-h-9 rounded-lg border text-xs font-bold transition ${student.status === option.value ? option.className : "border-border bg-surface text-muted hover:bg-sage/60"}`}><span className="sm:hidden">{option.short}</span><span className="hidden sm:inline">{option.label}</span></button>)}</div></div>)}{filtered.length === 0 ? <div className="p-10 text-center text-sm text-muted">دانش‌آموزی با این جست‌وجو پیدا نشد.</div> : null}</div>
      </Panel>
      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start"><Panel><SectionHeading title="خلاصه پیش‌نویس" description="این تغییرات هنوز ذخیره نمی‌شوند." /><div className="mt-5 grid grid-cols-2 gap-2">{statusOptions.map((option) => <div key={option.value} className="rounded-xl bg-sage/60 p-3"><p className="text-xs text-muted">{option.label}</p><p className="mt-1 text-xl font-black tabular-nums text-primary">{counts[option.value]}</p></div>)}</div><div className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-[#7d5a1c]">ثبت حضور و غیاب و ارسال اطلاع‌رسانی در فاز ۶ فعال می‌شود.</div><Button type="button" className="mt-4 w-full" disabled>ثبت حضور و غیاب · فاز ۶</Button></Panel></aside>
    </div>
  );
}
