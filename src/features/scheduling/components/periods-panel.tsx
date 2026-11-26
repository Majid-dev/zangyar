"use client";

import { useState } from "react";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { toPersianDigits } from "@/lib/jalali";

import { deletePeriodAction, upsertPeriodAction } from "../actions";

type ShiftType = "MORNING" | "AFTERNOON" | "ROTATING";

export type PeriodRow = {
  id: string;
  ordinal: number;
  startTime: string;
  endTime: string;
  afternoonStartTime: string | null;
  afternoonEndTime: string | null;
};

function clock(time: string) {
  return time.slice(0, 5);
}

/**
 * The school's periods, and the form that maintains them.
 *
 * A period's times are shown per shift, because a rotating school runs a different
 * daily schedule in the morning and the afternoon and an admin needs to see both to
 * know what they are editing. A fixed school has one schedule, so it sees one — the
 * afternoon pair is offered only when the shift rotates, which is also the rule the
 * server keeps: an afternoon schedule on a fixed school would describe a shift that
 * never runs.
 *
 * Editing is inline rather than a separate page: clicking a period opens its times
 * in the same panel, so correcting one is a change of focus rather than a
 * navigation, and the list an admin is reading is the list they are editing.
 */
export function PeriodsPanel({
  periods,
  shiftType,
}: {
  periods: PeriodRow[];
  shiftType: ShiftType;
}) {
  const rotating = shiftType === "ROTATING";
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = periods.find((period) => period.id === editingId) ?? null;

  return (
    <Panel className="self-start">
      <SectionHeading
        eyebrow={`${toPersianDigits(periods.length)} زنگ`}
        title="زنگ‌های روز"
        description={
          rotating
            ? "برای هر زنگ، ساعت نوبت صبح و نوبت بعدازظهر را جدا تعیین کنید. هفته‌های چرخشی از ساعت همان نوبت استفاده می‌کنند."
            : "هر زنگ دو ساعت است؛ در برنامه هفتگی می‌توانید کل زنگ یا فقط یک ساعت آن را به دبیر بدهید."
        }
      />

      <div className="mt-5 divide-y divide-border border-t border-border">
        {periods.length === 0 ? (
          <p className="py-4 text-sm text-muted">هنوز زنگی تعریف نشده است.</p>
        ) : periods.map((period) => (
          <div key={period.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-primary">زنگ {toPersianDigits(period.ordinal)}</p>
              <p className="mt-1 text-xs tabular-nums text-muted" dir="ltr">
                {rotating ? "صبح: " : ""}{clock(period.startTime)} – {clock(period.endTime)}
              </p>
              {rotating ? (
                <p className="mt-0.5 text-xs tabular-nums text-muted" dir="ltr">
                  بعدازظهر: {period.afternoonStartTime ? `${clock(period.afternoonStartTime)} – ${clock(period.afternoonEndTime ?? "")}` : "تعیین نشده"}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingId(editingId === period.id ? null : period.id)}
                className="rounded-xl border border-secondary/25 bg-secondary/10 px-3 py-1.5 text-xs font-bold text-secondary transition hover:bg-secondary/15"
              >
                {editingId === period.id ? "بستن" : "ویرایش"}
              </button>
              <ActionForm action={deletePeriodAction}>
                <input type="hidden" name="periodId" value={period.id} />
                <SubmitButton size="sm" variant="ghost" pendingLabel="…">حذف</SubmitButton>
              </ActionForm>
            </div>
          </div>
        ))}
      </div>

      {/* Remounted on the target so the time inputs re-read their defaults: a
          client-side switch from one period to another reuses the component, and a
          defaultValue is only read on mount. */}
      <PeriodTimesForm
        key={editing ? `edit-${editing.id}` : "new"}
        rotating={rotating}
        editing={editing}
        onDone={() => setEditingId(null)}
      />

      {editing ? (
        <button type="button" onClick={() => setEditingId(null)} className="mt-3 text-xs font-bold text-muted hover:text-primary">
          انصراف از ویرایش
        </button>
      ) : null}
    </Panel>
  );
}

function PeriodTimesForm({
  rotating,
  editing,
  onDone,
}: {
  rotating: boolean;
  editing: PeriodRow | null;
  onDone: () => void;
}) {
  const isEditing = Boolean(editing);
  return (
    <ActionForm action={upsertPeriodAction} onSuccess={onDone} className="mt-5 grid gap-4 border-t border-border pt-5">
      <p className="text-xs leading-6 text-muted">
        زنگ‌ها به ترتیب ساعت شروع شماره‌گذاری می‌شوند و نباید در یک نوبت با هم هم‌پوشانی داشته باشند.
      </p>
      {isEditing ? <input type="hidden" name="periodId" value={editing?.id} /> : null}

      <div>
        <p className="mb-2 text-xs font-bold text-primary">{rotating ? "ساعت نوبت صبح" : "ساعت زنگ"}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="شروع" name="startTime">
            <Input name="startTime" type="time" required dir="ltr" className="text-start" defaultValue={editing ? clock(editing.startTime) : undefined} />
          </Field>
          <Field label="پایان" name="endTime">
            <Input name="endTime" type="time" required dir="ltr" className="text-start" defaultValue={editing ? clock(editing.endTime) : undefined} />
          </Field>
        </div>
      </div>

      {/* The afternoon schedule is only meaningful for a rotating school, and only
          then does the server accept it, so a fixed school never sees the fields. */}
      {rotating ? (
        <div>
          <p className="mb-2 text-xs font-bold text-primary">ساعت نوبت بعدازظهر</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="شروع" name="afternoonStartTime">
              <Input
                name="afternoonStartTime"
                type="time"
                dir="ltr"
                className="text-start"
                defaultValue={editing?.afternoonStartTime ? clock(editing.afternoonStartTime) : undefined}
              />
            </Field>
            <Field label="پایان" name="afternoonEndTime">
              <Input
                name="afternoonEndTime"
                type="time"
                dir="ltr"
                className="text-start"
                defaultValue={editing?.afternoonEndTime ? clock(editing.afternoonEndTime) : undefined}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs leading-6 text-muted">
            اگر نوبت بعدازظهر را خالی بگذارید، در هفته‌های بعدازظهر از ساعت نوبت صبح استفاده می‌شود.
          </p>
        </div>
      ) : null}

      <div>
        <SubmitButton variant="secondary" pendingLabel="در حال ذخیره…">{isEditing ? "ذخیره تغییرات" : "افزودن زنگ"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
