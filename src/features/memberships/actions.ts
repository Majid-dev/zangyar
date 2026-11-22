"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { executeAction } from "@/lib/actions/execute";
import type { ActionResult } from "@/lib/actions/result";

import { createMembership, updateMembershipStatus } from "./services";
import { createMembershipSchema, updateMembershipStatusSchema } from "./schema";

function revalidateMemberships() {
  revalidatePath("/settings/members");
  revalidatePath("/dashboard");
}

export async function createMembershipAction(input: unknown): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await createMembership({ headers: await headers(), input: createMembershipSchema.parse(input) });
    revalidateMemberships();
    return result;
  }, "عضویت مدرسه ایجاد شد.");
}

export async function updateMembershipStatusAction(input: unknown): Promise<ActionResult<unknown>> {
  return executeAction(async () => {
    const result = await updateMembershipStatus({ headers: await headers(), input: updateMembershipStatusSchema.parse(input) });
    revalidateMemberships();
    return result;
  }, "وضعیت عضویت تغییر کرد.");
}
