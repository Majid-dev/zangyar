"use client";

import { useState } from "react";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field } from "@/components/ui/field";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { updateSchoolShiftSettingsAction } from "../actions";

type ShiftType = "MORNING" | "AFTERNOON" | "ROTATING";

const shiftOptions: { value: ShiftType; label: string; description: string }[] = [
  { value: "MORNING", label: "صبح", description: "مدرسه فقط در نوبت صبح برگزار می‌شود." },
  { value: "AFTERNOON", label: "بعدازظهر", description: "مدرسه فقط در نوبت بعدازظهر برگزار می‌شود." },
  { value: "ROTATING", label: "چرخشی هفتگی (صبح/بعدازظهر)", description: "نوبت هر هفته بین صبح و بعدازظهر جابه‌جا می‌شود." },
];

/**
 * The school's shift type and operating days.
 *
 * The shift type is a radio group rather than a dropdown because it is three
 * mutually exclusive choices whose consequences differ — a dropdown hides two of
 * them behind a click and gives no room to say what each one means. The base date
 * field is disabled unless the shift rotates, which is the rule the server
 * enforces as well: a fixed shift has no rotation to anchor.
 *
 * The base date is what makes "which shift is this week" reproducible. When it
 * rotates, the week containing the chosen date is a morning week and every
 * following week alternates.
 */
export function ShiftSettingsForm({
  shiftType,
  rotationBaseDate,
  operatingDays,
  weekdays,
}: {
  shiftType: ShiftType;
  rotationBaseDate: string | null;
  operatingDays: number[];
  weekdays: { value: string; label: string }[];
}) {
  const [kind, setKind] = useState<ShiftType>(shiftType);
  const rotating = kind === "ROTATING";

  return (
    <Panel>
      <SectionHeading
        title="شیفت و روزهای فعالیت"
        description="نوع شیفت مدرسه و روزهایی که مدرسه باز است را تعیین کنید. تنها روزهای انتخاب‌شده قابل برنامه‌ریزی و ثبت حضور هستند."
      />
      <ActionForm action={updateSchoolShiftSettingsAction} className="mt-5 grid gap-5">
        <fieldset>
          <legend className="text-xs font-bold text-primary">نوع شیفت</legend>
          <div className="mt-2 grid gap-2">
            {shiftOptions.map((option) => {
              const selected = kind === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selected ? "border-secondary bg-secondary/8" : "border-border hover:bg-sage/50"}`}
                >
                  <input
                    type="radio"
                    name="shiftType"
                    value={option.value}
                    checked={selected}
                    onChange={() => setKind(option.value)}
                    className="mt-0.5 size-4 accent-[color:var(--color-secondary)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-primary">{option.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted">{option.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className={rotating ? "" : "opacity-50"}>
          <Field
            label="تاریخ مبنای چرخش"
            name="rotationBaseDate"
            hint={rotating ? "هفته‌ی این تاریخ نوبت صبح است؛ هفته‌های بعد یکی‌درمیان جابه‌جا می‌شود." : "فقط برای شیفت چرخشی فعال است."}
          >
            {/* Rendered but inert when the shift is fixed: a disabled input would not
                submit, and the server needs to see no date to accept the change. */}
            <JalaliDatePicker name="rotationBaseDate" defaultValue={rotating ? rotationBaseDate : null} disabled={!rotating} />
          </Field>
        </div>

        <fieldset>
          <legend className="text-xs font-bold text-primary">روزهای فعالیت</legend>
          <p className="mt-1 text-xs leading-5 text-muted">هفته از شنبه آغاز می‌شود. حداقل یک روز لازم است.</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {weekdays.map((day) => (
              <label key={day.value} className="flex items-center gap-2 text-sm text-primary">
                <input
                  type="checkbox"
                  name="operatingDays"
                  value={day.value}
                  defaultChecked={operatingDays.includes(Number(day.value))}
                  className="size-4"
                />
                {day.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div><SubmitButton pendingLabel="در حال ذخیره…">ذخیره تنظیمات</SubmitButton></div>
      </ActionForm>
    </Panel>
  );
}
