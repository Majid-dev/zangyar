import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";

import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  accounts,
  auditLogs,
  schoolMemberships,
  schools,
  sessions,
  users,
} from "@/lib/db/schema";
import { listSchoolMemberships } from "@/features/memberships/queries";
import { updateMembershipStatus } from "@/features/memberships/services";

import { AuthorizationError, requireSchoolAccess } from "./authorization";

config({ path: ".env.local" });

type AuthenticatedUser = {
  id: string;
  headers: Headers;
};

const canRun = Boolean(
  process.env.DATABASE_URL &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_URL &&
    process.env.RUN_DB_INTEGRATION_TESTS === "1",
);

function cookieHeader(response: Response) {
  const responseHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = responseHeaders.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];

  return setCookies
    .map((value) => value.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
}

async function createAuthenticatedUser(suffix: string): Promise<AuthenticatedUser> {
  const email = `phase3-${suffix}-${crypto.randomUUID()}@example.com`;
  const password = "A-secure-password-123!";
  const auth = getAuth();
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  const signUpResponse = await auth.handler(
    new Request(`${baseUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `Phase 3 ${suffix}`, email, password }),
    }),
  );
  expect(signUpResponse.ok).toBe(true);

  const signInResponse = await auth.handler(
    new Request(`${baseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(signInResponse.ok).toBe(true);

  const body = (await signInResponse.json()) as { user: { id: string } };
  return { id: body.user.id, headers: new Headers({ cookie: cookieHeader(signInResponse) }) };
}

describe.skipIf(!canRun)("persisted Better Auth and tenant authorization", () => {
  let admin: AuthenticatedUser;
  let teacher: AuthenticatedUser;
  let schoolA: string;
  let schoolB: string;
  let teacherMembershipId: string;
  let crossTenantMembershipId: string;

  beforeAll(async () => {
    admin = await createAuthenticatedUser("admin");
    teacher = await createAuthenticatedUser("teacher");

    const db = getDb();
    const [createdSchoolA] = await db
      .insert(schools)
      .values({ slug: `phase3-a-${crypto.randomUUID()}`, name: "Phase 3 School A" })
      .returning({ id: schools.id });
    const [createdSchoolB] = await db
      .insert(schools)
      .values({ slug: `phase3-b-${crypto.randomUUID()}`, name: "Phase 3 School B" })
      .returning({ id: schools.id });

    schoolA = createdSchoolA.id;
    schoolB = createdSchoolB.id;

    const [teacherMembership] = await db
      .insert(schoolMemberships)
      .values({ schoolId: schoolA, userId: teacher.id, role: "TEACHER", status: "ACTIVE" })
      .returning({ id: schoolMemberships.id });
    teacherMembershipId = teacherMembership.id;

    await db.insert(schoolMemberships).values({
      schoolId: schoolA,
      userId: admin.id,
      role: "SCHOOL_ADMIN",
      status: "ACTIVE",
    });

    const [crossTenantMembership] = await db
      .insert(schoolMemberships)
      .values({ schoolId: schoolB, userId: teacher.id, role: "TEACHER", status: "ACTIVE" })
      .returning({ id: schoolMemberships.id });
    crossTenantMembershipId = crossTenantMembership.id;
  });

  it("persists Better Auth identity and session data", async () => {
    const db = getDb();
    const [persistedUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, admin.id));
    const [persistedSession] = await db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(eq(sessions.userId, admin.id))
      .limit(1);

    expect(persistedUser?.id).toBe(admin.id);
    expect(persistedSession?.userId).toBe(admin.id);
  });

  it("resolves a persisted session and verified membership", async () => {
    const context = await requireSchoolAccess({ headers: admin.headers, schoolId: schoolA, roles: ["SCHOOL_ADMIN"] });
    expect(context.schoolId).toBe(schoolA);
    expect(context.userId).toBe(admin.id);
  });

  it("rejects a valid session from another tenant", async () => {
    await expect(requireSchoolAccess({ headers: admin.headers, schoolId: schoolB })).rejects.toMatchObject({
      code: "SCHOOL_ACCESS_DENIED",
    });
  });

  it("rejects the wrong school role", async () => {
    await expect(requireSchoolAccess({ headers: teacher.headers, schoolId: schoolA, roles: ["SCHOOL_ADMIN"] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects an unauthenticated request", async () => {
    await expect(listSchoolMemberships({ headers: new Headers(), schoolId: schoolA })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("scopes membership listing to the verified tenant", async () => {
    const memberships = await listSchoolMemberships({ headers: admin.headers, schoolId: schoolA });
    expect(memberships.every((membership) => membership.schoolId === schoolA)).toBe(true);
    expect(memberships.some((membership) => membership.schoolId === schoolB)).toBe(false);
  });

  it("rejects a cross-tenant membership update and preserves the target", async () => {
    await expect(
      updateMembershipStatus({
        headers: admin.headers,
        input: { membershipId: crossTenantMembershipId, status: "REVOKED" },
      }),
    ).rejects.toThrow("School membership not found.");

    const [membership] = await getDb()
      .select({ status: schoolMemberships.status })
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.id, crossTenantMembershipId), eq(schoolMemberships.schoolId, schoolB)));
    expect(membership?.status).toBe("ACTIVE");
  });

  it("rejects a revoked membership", async () => {
    await getDb()
      .update(schoolMemberships)
      .set({ status: "REVOKED", revokedAt: new Date() })
      .where(eq(schoolMemberships.id, teacherMembershipId));

    await expect(requireSchoolAccess({ headers: teacher.headers, schoolId: schoolA })).rejects.toMatchObject({
      code: "SCHOOL_ACCESS_DENIED",
    });
  });

  it("writes no cross-tenant audit event for a rejected update", async () => {
    const auditEvents = await getDb()
      .select({ schoolId: auditLogs.schoolId })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, crossTenantMembershipId));

    expect(auditEvents.every((event) => event.schoolId === schoolB)).toBe(true);
  });

  it("recognizes a revoked session membership without trusting client role state", async () => {
    await getDb()
      .update(schoolMemberships)
      .set({ status: "REVOKED", revokedAt: new Date() })
      .where(eq(schoolMemberships.id, crossTenantMembershipId));

    await expect(requireSchoolAccess({ headers: teacher.headers, schoolId: schoolB, roles: ["TEACHER"] })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  afterAll(async () => {
    if (!admin || !teacher) return;

    const db = getDb();
    await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolA));
    await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolB));
    await db.delete(schools).where(eq(schools.id, schoolA));
    await db.delete(schools).where(eq(schools.id, schoolB));
    await db.delete(auditLogs).where(eq(auditLogs.actorUserId, admin.id));
    await db.delete(sessions).where(eq(sessions.userId, admin.id));
    await db.delete(sessions).where(eq(sessions.userId, teacher.id));
    await db.delete(accounts).where(eq(accounts.userId, admin.id));
    await db.delete(accounts).where(eq(accounts.userId, teacher.id));
    await db.delete(users).where(eq(users.id, admin.id));
    await db.delete(users).where(eq(users.id, teacher.id));
  });
});
