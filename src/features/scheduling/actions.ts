"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { executeAction } from "@/lib/actions/execute";
import type { ActionResult } from "@/lib/actions/result";

import { formDataToObject, nullableString, optionalNumber } from "@/features/academics/form-data";
import {
  assignTimetableHoursSchema,
  clearTimetableHoursSchema,
  deletePeriodSchema,
  setTeacherWeeklyHoursSchema,
  schoolShiftSettingsSchema,
  upsertPeriodSchema,
} from "./schema";
import {
  assignTimetableHours,
  clearTimetableHours,
  deletePeriod,
  setTeacherWeeklyHours,
  updateSchoolShiftSettings,
  upsertPeriod,
} from "./services";

const SCHEDULING_PATHS = ["/academics", "/academics/timetable", "/academics/periods", "/academics/classrooms", "/academics/hours", "/attendance", "/dashboard"] as const;

function revalidateScheduling() {
  for (const path of SCHEDULING_PATHS) revalidatePath(path);
}

/**
 * Operating days arrive as repeated `operatingDays` fields from a checkbox group,
 * which `FormData.getAll` collects in submission order. A plain object conversion
 * would keep only the last one, which is the shape bug this avoids.
 */
function readOperatingDays(formData: FormData) {
  return formData.getAll("operatingDays").map((value) => String(value));
}

export async function updateSchoolShiftSettingsAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await updateSchoolShiftSettings({
      headers: await headers(),
      input: schoolShiftSettingsSchema.parse({
        shiftType: formData.get("shiftType"),
        rotationBaseDate: nullableString(formData.get("rotationBaseDate")),
        operatingDays: readOperatingDays(formData),
      }),
    });
    revalidateScheduling();
    return result;
  }, "تنظیمات شیفت و روزهای فعالیت ذخیره شد.");
}

export async function upsertPeriodAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await upsertPeriod({
      headers: await headers(),
      input: upsertPeriodSchema.parse({
        periodId: nullableString(formData.get("periodId")),
        startTime: formData.get("startTime"),
        endTime: formData.get("endTime"),
      }),
    });
    revalidateScheduling();
    return result;
  }, "زنگ ذخیره شد.");
}

export async function deletePeriodAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await deletePeriod({ headers: await headers(), input: deletePeriodSchema.parse(formDataToObject(formData)) });
    revalidateScheduling();
    return result;
  }, "زنگ حذف شد.");
}

/**
 * The grid's save action, called directly with a structured payload rather than a
 * `FormData`.
 *
 * The submission is a set of coordinates, which a form would have to flatten into
 * repeated fields and rebuild on the server. The attendance workspace already
 * sends its records the same way, so this is the same shape of call: one object in,
 * one result out.
 */
export async function assignTimetableHoursAction(input: unknown): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await assignTimetableHours({ headers: await headers(), input: assignTimetableHoursSchema.parse(input) });
    revalidateScheduling();
    return result;
  }, "برنامه هفتگی ذخیره شد.");
}

export async function clearTimetableHoursAction(input: unknown): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await clearTimetableHours({ headers: await headers(), input: clearTimetableHoursSchema.parse(input) });
    revalidateScheduling();
    return result;
  }, "خانه‌های انتخاب‌شده از برنامه هفتگی پاک شدند.");
}

export async function setTeacherWeeklyHoursAction(_previous: unknown, formData: FormData): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await setTeacherWeeklyHours({
      headers: await headers(),
      input: setTeacherWeeklyHoursSchema.parse({ ...formDataToObject(formData), requiredWeeklyHours: optionalNumber(formData.get("requiredWeeklyHours")) ?? 0 }),
    });
    revalidateScheduling();
    return result;
  }, "ساعت موظفی دبیر ثبت شد.");
}
