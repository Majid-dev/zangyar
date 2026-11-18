import "server-only";

import { and, eq } from "drizzle-orm";

import { writeAuditEvent } from "@/lib/audit";
import { requireSchoolRole } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { schoolMemberships, users } from "@/lib/db/schema";

import {
  createMembershipSchema,
  updateMembershipStatusSchema,
  type CreateMembershipInput,
  type UpdateMembershipStatusInput,
} from "./schema";

export async function createMembership(options: { headers: Headers; input: CreateMembershipInput }) {
  const context = await requireSchoolRole({ headers: options.headers, roles: ["SCHOOL_ADMIN"] });
  const input = createMembershipSchema.parse(options.input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user) {
      throw new Error("User not found.");
    }

    const [membership] = await tx
      .insert(schoolMemberships)
      .values({
        schoolId: context.schoolId,
        userId: input.userId,
        role: input.role,
        status: "ACTIVE",
      })
      .returning();

    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "MEMBERSHIP_CREATED",
      entityType: "SCHOOL_MEMBERSHIP",
      entityId: membership.id,
      metadata: { role: membership.role, targetUserId: membership.userId },
    });

    return membership;
  });
}

export async function updateMembershipStatus(options: {
  headers: Headers;
  input: UpdateMembershipStatusInput;
}) {
  const context = await requireSchoolRole({ headers: options.headers, roles: ["SCHOOL_ADMIN"] });
  const input = updateMembershipStatusSchema.parse(options.input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [membership] = await tx
      .update(schoolMemberships)
      .set({
        status: input.status,
        suspendedAt: input.status === "SUSPENDED" ? new Date() : null,
        revokedAt: input.status === "REVOKED" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schoolMemberships.id, input.membershipId),
          eq(schoolMemberships.schoolId, context.schoolId),
        ),
      )
      .returning();

    if (!membership) {
      throw new Error("School membership not found.");
    }

    if (membership.userId === context.userId) {
      throw new Error("A School Admin cannot change their own membership status.");
    }

    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "MEMBERSHIP_STATUS_CHANGED",
      entityType: "SCHOOL_MEMBERSHIP",
      entityId: membership.id,
      metadata: { status: membership.status, targetUserId: membership.userId },
    });

    return membership;
  });
}
