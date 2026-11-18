"use server";

import { headers } from "next/headers";

import { createMembership, updateMembershipStatus } from "./services";
import { createMembershipSchema, updateMembershipStatusSchema } from "./schema";

export async function createMembershipAction(input: unknown) {
  const parsed = createMembershipSchema.parse(input);
  return createMembership({ headers: await headers(), input: parsed });
}

export async function updateMembershipStatusAction(input: unknown) {
  const parsed = updateMembershipStatusSchema.parse(input);
  return updateMembershipStatus({ headers: await headers(), input: parsed });
}
