import "server-only";

import { getDb } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

type DatabaseWriter = Pick<ReturnType<typeof getDb>, "insert">;

export type AuditEvent = {
  schoolId?: string | null;
  actorUserId: string;
  actorMembershipId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeAuditEvent(db: DatabaseWriter, event: AuditEvent) {
  await db.insert(auditLogs).values({
    schoolId: event.schoolId ?? null,
    actorUserId: event.actorUserId,
    actorMembershipId: event.actorMembershipId ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    metadata: event.metadata ?? null,
    ipAddress: event.ipAddress ?? null,
    userAgent: event.userAgent ?? null,
  });
}
