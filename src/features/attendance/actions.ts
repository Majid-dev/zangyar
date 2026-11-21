"use server";

import { headers } from "next/headers";

import { submitAttendance } from "./services";
import { submitAttendanceSchema } from "./schema";

export async function submitAttendanceAction(input: unknown) {
  return submitAttendance({ headers: await headers(), input: submitAttendanceSchema.parse(input) });
}
