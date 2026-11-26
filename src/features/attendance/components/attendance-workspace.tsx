"use client";

import { useMemo, useState, useTransition } from "react";

import { ActionFeedback } from "@/components/ui/action-form";
import { submitAttendanceAction } from "@/features/attendance/actions";
import type { ActionState } from "@/lib/actions/result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { toPersianDigits } from "@/lib/jalali";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
type WorkspaceStudent = { id: string; enrollmentId: string; name: string; code: string };
type WorkspaceSlot = {
  timetableEntryId: string;
  classroomId: string;
  classroomName: string;
  subjectName: string;
  shiftName: string;
  periodLabel: string;
  periodOrdinal: number;
  startTime: string;
  endTime: string;
  sessionId: string | null;
  sessionStatus: "OPEN" | "CLOSED" | null;
  submissionDeadlineAt: string | Date | null;
};
export type AttendanceWorkspaceData = {
  businessDate: string;
  slots: WorkspaceSlot[];
  slot: WorkspaceSlot | null;
  students: WorkspaceStudent[];
};

const statusOptions: { value: AttendanceStatus; label: string; short: string; className: string }[] = [
  { value: "PRESENT", label: "حاضر", short: "ح", className: "border-success/30 bg-success/10 text-success" },
  { value: "ABSENT", label: "غایب", short: "غ", className: "border-danger/30 bg-danger/10 text-danger" },
  { value: "LATE", label: "تأخیر", short: "ت", className: "border-warning/30 bg-warning/15 text-[#8b5a08]" },
  { value: "EXCUSED", label: "موجه", short: "م", className: "border-secondary/30 bg-secondary/10 text-secondary" },
];

function clock(time: string) {
  return toPersianDigits(time.slice(0, 5));
}

/**
 * Attendance for one period.
 *
 * The student rows are local state because statuses are chosen before anything is
 * sent, but the slot itself is not: selecting a different period navigates, so the
 * server decides what the period's roster and responsibility are. The rows are
 * reset by remounting this component on the slot key rather than by an effect
 * watching for a change, so a half-filled previous period can never be submitted
 * under the new period's id — the state that held it no longer exists.
 */
export function AttendanceWorkspace({ workspace }: { workspace: AttendanceWorkspaceData }) {
  return <AttendanceWorkspaceForm key={workspace.slot?.timetableEntryId ?? "none"} workspace={workspace} />;
}

function AttendanceWorkspaceForm({ workspace }: { workspace: AttendanceWorkspaceData }) {
  const [students, setStudents] = useState(() => workspace.students.map((student) => ({ ...student, status: "PRESENT" as AttendanceStatus })));
  const [query, setQuery] = useState("");
  const [actionState, setActionState] = useState<ActionState<unknown>>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => students.filter((student) => student.name.includes(query) || student.code.includes(query)), [query, students]);
  const counts = useMemo(() => students.reduce<Record<AttendanceStatus, number>>((result, student) => ({ ...result, [student.status]: result[student.status] + 1 }), { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }), [students]);

  function setAll(status: AttendanceStatus) { setStudents((current) => current.map((student) => ({ ...student, status }))); }
  function setStatus(id: string, status: AttendanceStatus) { setStudents((current) => current.map((student) => student.id === id ? { ...student, status } : student)); }
  function save() {
    if (!workspace.slot) return;
    setActionState(null);
    startTransition(async () => {
      const result = await submitAttendanceAction({
        timetableEntryId: workspace.slot?.timetableEntryId,
        businessDate: workspace.businessDate,
        records: students.map(({ enrollmentId, status }) => ({ enrollmentId, status })),
      });
      setActionState(result);
    });
  }

  if (workspace.slots.length === 0) {
    return (
      <Panel>
        <SectionHeading
          title="زنگی برای امروز برنامه‌ریزی نشده است"
          description="برای این تاریخ، هیچ زنگی در برنامه هفتگی شما نیست. برنامه هفتگی کلاس‌ها را از بخش ساختار آموزشی تکمیل کنید."
        />
      </Panel>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-4">
        <Panel className="p-3 sm:p-4">
          <p className="px-1 text-xs font-bold text-muted">زنگ‌های این روز</p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {workspace.slots.map((slot) => {
              const isCurrent = slot.timetableEntryId === workspace.slot?.timetableEntryId;
              return (
                <a
                  key={slot.timetableEntryId}
                  href={`/attendance?date=${workspace.businessDate}&timetableEntryId=${slot.timetableEntryId}`}
                  aria-current={isCurrent ? "true" : undefined}
                  className={`flex min-w-[11rem] shrink-0 flex-col gap-1 rounded-xl border px-3 py-2.5 text-start transition ${isCurrent ? "border-primary bg-primary text-white" : "border-border bg-surface hover:bg-sage/60"}`}
                >
                  <span className={`text-[0.7rem] font-bold ${isCurrent ? "text-white/70" : "text-muted"}`}>زنگ {toPersianDigits(slot.periodOrdinal)} · {clock(slot.startTime)}</span>
                  <span className="truncate text-sm font-bold">{slot.classroomName}</span>
                  <span className={`truncate text-[0.7rem] ${isCurrent ? "text-white/70" : "text-muted"}`}>{slot.subjectName}</span>
                  <span className={`mt-0.5 text-[0.7rem] font-bold ${slot.sessionId ? "text-success" : isCurrent ? "text-accent" : "text-warning"}`}>
                    {slot.sessionId ? "ثبت شده" : "ثبت نشده"}
                  </span>
                </a>
              );
            })}
          </div>
        </Panel>

        {workspace.slot ? (
          <Panel className="overflow-hidden p-0">
            <div className="border-b border-border p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionHeading
                  eyebrow={`${workspace.slot.shiftName} · زنگ ${toPersianDigits(workspace.slot.periodOrdinal)} (${clock(workspace.slot.startTime)} تا ${clock(workspace.slot.endTime)})`}
                  title={`${workspace.slot.classroomName} — ${workspace.slot.subjectName}`}
                  description={`${toPersianDigits(students.length)} دانش‌آموز`}
                />
                <Badge tone={workspace.slot.sessionId ? "success" : "warning"}>{workspace.slot.sessionId ? "قبلاً ثبت شده" : "ثبت امروز"}</Badge>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">جست‌وجوی دانش‌آموز</span>
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام یا کد دانش‌آموز" className="pe-10" />
                </label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setAll("PRESENT")}>همه حاضر</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAll("ABSENT")}>همه غایب</Button>
                </div>
              </div>
            </div>
            <div className="hidden grid-cols-[minmax(0,1fr)_13rem] gap-3 bg-sage/50 px-5 py-2.5 text-xs font-bold text-muted sm:grid"><span>دانش‌آموز</span><span>وضعیت حضور</span></div>
            <div className="divide-y divide-border">
              {filtered.map((student, index) => (
                <div key={student.id} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sage text-xs font-black text-primary tabular-nums">{toPersianDigits(index + 1)}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-primary">{student.name}</p>
                      <p className="mt-0.5 text-xs text-muted">کد {student.code}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={`وضعیت حضور ${student.name}`}>
                    {statusOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={student.status === option.value}
                        onClick={() => setStatus(student.id, option.value)}
                        className={`min-h-9 rounded-lg border text-xs font-bold transition ${student.status === option.value ? option.className : "border-border bg-surface text-muted hover:bg-sage/60"}`}
                      >
                        <span className="sm:hidden">{option.short}</span>
                        <span className="hidden sm:inline">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {filtered.length === 0 ? <div className="p-10 text-center text-sm text-muted">دانش‌آموزی با این جست‌وجو پیدا نشد.</div> : null}
            </div>
          </Panel>
        ) : null}
      </div>

      {workspace.slot ? (
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Panel>
            <SectionHeading title="خلاصه ثبت" description="وضعیت انتخاب‌شده برای دانش‌آموزان این زنگ." />
            <div className="mt-5 grid grid-cols-2 gap-2">
              {statusOptions.map((option) => (
                <div key={option.value} className="rounded-xl bg-sage/60 p-3">
                  <p className="text-xs text-muted">{option.label}</p>
                  <p className="mt-1 text-xl font-black tabular-nums text-primary">{toPersianDigits(counts[option.value])}</p>
                </div>
              ))}
            </div>
            <ActionFeedback state={actionState} />
            <Button type="button" className="mt-4 w-full" disabled={isPending || students.length === 0} onClick={save}>
              {isPending ? "در حال ثبت…" : "ثبت حضور و غیاب این زنگ"}
            </Button>
          </Panel>
        </aside>
      ) : null}
    </div>
  );
}
