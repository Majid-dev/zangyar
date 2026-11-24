import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";

import { getAuth } from "@/lib/auth";
import { requireSchoolAccess, requirePlatformAdmin } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { accounts, auditLogs, platformAdmins, schoolMemberships, schoolSettings, schools, sessions, users } from "@/lib/db/schema";
import { normalizeIranianMobile } from "@/lib/mobile";
import { getDemoSeedConfig } from "./config";
import { createMembershipSchema } from "@/features/memberships/schema";
import { createMembership } from "@/features/memberships/services";
import { seedDemoTenant } from "./seed";

config({ path: ".env.local" });

const canRun = Boolean(
  process.env.DATABASE_URL &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_URL &&
    process.env.RUN_DB_INTEGRATION_TESTS === "1",
);

const DEMO_CONFIG = getDemoSeedConfig();
const DEMO_MOBILE = normalizeIranianMobile(DEMO_CONFIG.adminMobile) ?? DEMO_CONFIG.adminMobile;

function cookieHeader(response: Response) {
  const responseHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = responseHeaders.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return setCookies
    .map((value) => value.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
}

async function signInAsDemoAdmin() {
  const response = await getAuth().handler(
    new Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-in/phone-number`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: DEMO_MOBILE, password: DEMO_CONFIG.adminPassword }),
    }),
  );
  expect(response.status).toBe(200);
  return new Headers({ cookie: cookieHeader(response) });
}

describe("membership role input cannot grant platform privileges", () => {
  it("accepts only school-level roles", () => {
    for (const role of ["SCHOOL_ADMIN", "TEACHER"]) {
      expect(createMembershipSchema.safeParse({ userId: "user-1", role }).success).toBe(true);
    }
    for (const role of ["PlatformAdmin", "PLATFORM_ADMIN", "ADMIN", "OWNER", "SUPERADMIN"]) {
      expect(createMembershipSchema.safeParse({ userId: "user-1", role }).success).toBe(false);
    }
  });
});

describe.skipIf(!canRun)("demo tenant isolation and role boundaries", () => {
  let demoAdmin: { id: string; schoolId: string };
  let demoHeaders: Headers;
  let otherSchoolId: string;
  let otherUserId: string;

  beforeAll(async () => {
    const db = getDb();

    // Clean prior demo rows so the suite is repeatable on a shared local DB.
    const existing = await db.select({ id: schools.id }).from(schools).where(eq(schools.slug, DEMO_CONFIG.schoolSlug));
    for (const school of existing) {
      await db.delete(auditLogs).where(eq(auditLogs.schoolId, school.id));
      await db.delete(schoolSettings).where(eq(schoolSettings.schoolId, school.id));
      await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, school.id));
      await db.delete(schools).where(eq(schools.id, school.id));
    }
    const [orphan] = await db.select({ id: users.id }).from(users).where(eq(users.phoneNumber, DEMO_MOBILE)).limit(1);
    if (orphan) {
      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, orphan.id));
      await db.delete(schoolMemberships).where(eq(schoolMemberships.userId, orphan.id));
      await db.delete(platformAdmins).where(eq(platformAdmins.userId, orphan.id));
      await db.delete(sessions).where(eq(sessions.userId, orphan.id));
      await db.delete(accounts).where(eq(accounts.userId, orphan.id));
      await db.delete(users).where(eq(users.id, orphan.id));
    }

    const seeded = await seedDemoTenant({
      environment: { nodeEnv: "development", databaseUrl: process.env.DATABASE_URL },
    });
    demoAdmin = { id: seeded.user.id, schoolId: seeded.school.id };
    demoHeaders = await signInAsDemoAdmin();

    const [otherSchool] = await db
      .insert(schools)
      .values({ slug: `isolation-${crypto.randomUUID()}`, name: "Isolation School" })
      .returning({ id: schools.id });
    otherSchoolId = otherSchool.id;

    // A separate tenant with its own member, used as the cross-tenant target.
    const [otherUser] = await db
      .insert(users)
      .values({ id: crypto.randomUUID(), name: "Other Tenant User", email: `other-${crypto.randomUUID()}@example.com` })
      .returning({ id: users.id });
    otherUserId = otherUser.id;

    await db
      .insert(schoolMemberships)
      .values({ schoolId: otherSchoolId, userId: otherUserId, role: "TEACHER", status: "ACTIVE" });
  });

  it("resolves the demo admin's own tenant", async () => {
    const context = await requireSchoolAccess({ headers: demoHeaders, roles: ["SCHOOL_ADMIN"] });
    expect(context.schoolId).toBe(demoAdmin.schoolId);
  });

  it("rejects a forged schoolId the demo admin has no membership in", async () => {
    await expect(requireSchoolAccess({ headers: demoHeaders, schoolId: otherSchoolId })).rejects.toMatchObject({
      code: "SCHOOL_ACCESS_DENIED",
    });
  });

  it("scopes a created membership to the verified tenant, not a client selector", async () => {
    const created = await createMembership({
      headers: demoHeaders,
      input: { userId: otherUserId, role: "TEACHER" },
    });

    expect(created.schoolId).toBe(demoAdmin.schoolId);
    expect(created.schoolId).not.toBe(otherSchoolId);
    expect(created.role).toBe("TEACHER");
  });

  it("does not let a School Admin create a platform administrator", async () => {
    await expect(
      createMembership({
        headers: demoHeaders,
        // A forged payload bypassing the UI must still be refused by validation.
        input: { userId: otherUserId, role: "PLATFORM_ADMIN" } as never,
      }),
    ).rejects.toThrow();

    const rows = await getDb().select().from(platformAdmins).where(eq(platformAdmins.userId, otherUserId));
    expect(rows).toHaveLength(0);
  });

  it("denies platform admin access to a School Admin", async () => {
    await expect(requirePlatformAdmin(demoHeaders)).rejects.toMatchObject({ code: "PLATFORM_ACCESS_DENIED" });
  });

  it("denies access after the demo membership is revoked", async () => {
    const db = getDb();
    await db
      .update(schoolMemberships)
      .set({ status: "REVOKED", revokedAt: new Date() })
      .where(and(eq(schoolMemberships.userId, demoAdmin.id), eq(schoolMemberships.schoolId, demoAdmin.schoolId)));

    await expect(requireSchoolAccess({ headers: demoHeaders })).rejects.toMatchObject({
      code: "SCHOOL_ACCESS_DENIED",
    });

    // Restore so later assertions and cleanup see the seeded state.
    await db
      .update(schoolMemberships)
      .set({ status: "ACTIVE", revokedAt: null })
      .where(and(eq(schoolMemberships.userId, demoAdmin.id), eq(schoolMemberships.schoolId, demoAdmin.schoolId)));
  });

  it("denies a suspended membership", async () => {
    const db = getDb();
    await db
      .update(schoolMemberships)
      .set({ status: "SUSPENDED", suspendedAt: new Date() })
      .where(and(eq(schoolMemberships.userId, demoAdmin.id), eq(schoolMemberships.schoolId, demoAdmin.schoolId)));

    await expect(requireSchoolAccess({ headers: demoHeaders })).rejects.toMatchObject({
      code: "SCHOOL_ACCESS_DENIED",
    });

    await db
      .update(schoolMemberships)
      .set({ status: "ACTIVE", suspendedAt: null })
      .where(and(eq(schoolMemberships.userId, demoAdmin.id), eq(schoolMemberships.schoolId, demoAdmin.schoolId)));
  });

  afterAll(async () => {
    if (!demoAdmin) return;
    const db = getDb();

    // Memberships are deleted by user, not by school: the suite creates a
    // membership for the other tenant's member inside the demo school.
    for (const userId of [otherUserId, demoAdmin.id]) {
      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, userId));
      await db.delete(schoolMemberships).where(eq(schoolMemberships.userId, userId));
      await db.delete(platformAdmins).where(eq(platformAdmins.userId, userId));
      await db.delete(sessions).where(eq(sessions.userId, userId));
      await db.delete(accounts).where(eq(accounts.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }

    for (const schoolId of [otherSchoolId, demoAdmin.schoolId]) {
      await db.delete(auditLogs).where(eq(auditLogs.schoolId, schoolId));
      await db.delete(schoolSettings).where(eq(schoolSettings.schoolId, schoolId));
      await db.delete(schools).where(eq(schools.id, schoolId));
    }
  });
});
