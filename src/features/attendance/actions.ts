"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { executeAction } from "@/lib/actions/execute";
import type { ActionResult } from "@/lib/actions/result";

import { submitAttendance } from "./services";
import { submitAttendanceSchema } from "./schema";

export async function submitAttendanceAction(input: unknown): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await submitAttendance({ headers: await headers(), input: submitAttendanceSchema.parse(input) });
    revalidatePath("/attendance");
    revalidatePath("/dashboard");
    return result;
  }, "حضور و غیاب با موفقیت ثبت شد.");
}
