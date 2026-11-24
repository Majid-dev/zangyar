import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";

import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { accounts, auditLogs, schoolMemberships, schoolSettings, schools, sessions, users } from "@/lib/db/schema";
import { normalizeIranianMobile } from "@/lib/mobile";
import { getDemoSeedConfig } from "@/features/auth/bootstrap/config";
import { assertDemoSeedAllowed, DemoSeedEnvironmentError } from "@/features/auth/bootstrap/environment";
import { seedDemoTenant } from "@/features/auth/bootstrap/seed";

config({ path: ".env.local" });

const canRun = Boolean(
  process.env.DATABASE_URL &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_URL &&
    process.env.RUN_DB_INTEGRATION_TESTS === "1",
);

const DEMO_CONFIG = getDemoSeedConfig();
const DEMO_MOBILE = normalizeIranianMobile(DEMO_CONFIG.adminMobile) ?? DEMO_CONFIG.adminMobile;

function environment() {
  return { nodeEnv: "development", databaseUrl: process.env.DATABASE_URL };
}

async function credentialPasswordFor(mobile: string) {
  const [row] = await getDb()
    .select({ password: accounts.password })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(eq(users.phoneNumber, mobile))
    .limit(1);
  return row?.password ?? null;
}

describe("demo seed environment gate", () => {
  it("refuses to run in production without writing", () => {
    expect(() =>
      assertDemoSeedAllowed({ nodeEnv: "production", databaseUrl: process.env.DATABASE_URL ?? "postgresql://u:p@localhost:5432/d" }),
    ).toThrowError(DemoSeedEnvironmentError);
  });

  it("refuses a non-development environment", () => {
    expect(() =>
      assertDemoSeedAllowed({ nodeEnv: "test", databaseUrl: "postgresql://u:p@localhost:5432/d" }),
    ).toThrowError(DemoSeedEnvironmentError);
  });

  it("refuses a non-local database host", () => {
    expect(() =>
      assertDemoSeedAllowed({ nodeEnv: "development", databaseUrl: "postgresql://u:p@db.example.com:5432/d" }),
    ).toThrowError(DemoSeedEnvironmentError);
  });

  it("refuses a missing database URL", () => {
    expect(() => assertDemoSeedAllowed({ nodeEnv: "development", databaseUrl: undefined })).toThrowError(
      DemoSeedEnvironmentError,
    );
  });

  it("allows a local development database", () => {
    expect(assertDemoSeedAllowed({ nodeEnv: "development", databaseUrl: "postgresql://u:p@localhost:5432/d" })).toEqual({
      nodeEnv: "development",
      host: "localhost",
    });
  });
});

describe.skipIf(!canRun)("demo tenant seed on a migrated database", () => {
  let firstRun: Awaited<ReturnType<typeof seedDemoTenant>>;
  let passwordAfterFirstRun: string | null;

  beforeAll(async () => {
    const db = getDb();
    // Isolate this suite from any pre-existing demo rows in the same database.
    const existing = await db
      .select({ id: schools.id })
      .from(schools)
      .where(eq(schools.slug, DEMO_CONFIG.schoolSlug));
    for (const school of existing) {
      await db.delete(auditLogs).where(eq(auditLogs.schoolId, school.id));
      await db.delete(schoolSettings).where(eq(schoolSettings.schoolId, school.id));
      await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, school.id));
      await db.delete(schools).where(eq(schools.id, school.id));
    }
    const [orphanUser] = await db.select({ id: users.id }).from(users).where(eq(users.phoneNumber, DEMO_MOBILE)).limit(1);
    if (orphanUser) {
      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, orphanUser.id));
      await db.delete(schoolMemberships).where(eq(schoolMemberships.userId, orphanUser.id));
      await db.delete(sessions).where(eq(sessions.userId, orphanUser.id));
      await db.delete(accounts).where(eq(accounts.userId, orphanUser.id));
      await db.delete(users).where(eq(users.id, orphanUser.id));
    }
    firstRun = await seedDemoTenant({ environment: environment() });
    passwordAfterFirstRun = await credentialPasswordFor(DEMO_MOBILE);
  });

  it("creates the demo school with the documented identity", async () => {
    expect(firstRun.school.created).toBe(true);

    const [school] = await getDb().select().from(schools).where(eq(schools.slug, DEMO_CONFIG.schoolSlug));
    expect(school?.name).toBe(DEMO_CONFIG.schoolName);
    expect(school?.status).toBe("ACTIVE");
  });

  it("creates a verified, mobile-identified School Admin account", async () => {
    expect(firstRun.user.created).toBe(true);
    expect(firstRun.user.mobile).toBe(DEMO_MOBILE);

    const [user] = await getDb().select().from(users).where(eq(users.phoneNumber, DEMO_MOBILE));
    expect(user?.id).toBe(firstRun.user.id);
    expect(user?.phoneNumberVerified).toBe(true);
    expect(user?.name).toBe(DEMO_CONFIG.adminName);
  });

  it("stores the password hashed, never in plaintext", () => {
    expect(passwordAfterFirstRun).toBeTruthy();
    expect(passwordAfterFirstRun).not.toBe(DEMO_CONFIG.adminPassword);
    expect(passwordAfterFirstRun!.length).toBeGreaterThan(40);
  });

  it("creates exactly one active SCHOOL_ADMIN membership", async () => {
    const memberships = await getDb()
      .select()
      .from(schoolMemberships)
      .where(eq(schoolMemberships.userId, firstRun.user.id));

    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("SCHOOL_ADMIN");
    expect(memberships[0].status).toBe("ACTIVE");
    expect(memberships[0].schoolId).toBe(firstRun.school.id);
  });

  it("grants no platform-level privilege", async () => {
    const { platformAdmins } = await import("@/lib/db/schema");
    const rows = await getDb().select().from(platformAdmins).where(eq(platformAdmins.userId, firstRun.user.id));
    expect(rows).toHaveLength(0);
  });

  it("signs in with the demo mobile number and password", async () => {
    const auth = getAuth();
    const response = await auth.handler(
      new Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-in/phone-number`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: DEMO_MOBILE, password: DEMO_CONFIG.adminPassword }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeTruthy();
    const body = (await response.json()) as { user: { id: string } };
    expect(body.user.id).toBe(firstRun.user.id);
  });

  it("accepts a normalizable spelling of the same mobile number", async () => {
    const auth = getAuth();
    const response = await auth.handler(
      new Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-in/phone-number`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: "+98 912 000 0000", password: DEMO_CONFIG.adminPassword }),
      }),
    );

    // The stored value is canonical, so an international spelling of the same
    // number must reach the same account after normalization.
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string } };
    expect(body.user.id).toBe(firstRun.user.id);
  });

  it("rejects a wrong password and an unknown mobile with the same status", async () => {
    const auth = getAuth();
    const base = `${process.env.BETTER_AUTH_URL}/api/auth/sign-in/phone-number`;

    const wrongPassword = await auth.handler(
      new Request(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: DEMO_MOBILE, password: "wrong-password-value" }),
      }),
    );
    const unknownMobile = await auth.handler(
      new Request(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: "09129999998", password: DEMO_CONFIG.adminPassword }),
      }),
    );

    expect(wrongPassword.status).toBe(401);
    expect(unknownMobile.status).toBe(401);
  });

  it("rejects a mobile number that is not an Iranian mobile", async () => {
    const auth = getAuth();
    const response = await auth.handler(
      new Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-in/phone-number`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: "08120000000", password: DEMO_CONFIG.adminPassword }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("keeps OTP delivery endpoints unreachable", async () => {
    const auth = getAuth();
    const response = await auth.handler(
      new Request(`${process.env.BETTER_AUTH_URL}/api/auth/phone-number/send-otp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: DEMO_MOBILE }),
      }),
    );

    expect(response.status).toBe(404);
  });

  it("is idempotent: a second run changes no rows and no password", async () => {
    const secondRun = await seedDemoTenant({ environment: environment() });

    expect(secondRun.school.id).toBe(firstRun.school.id);
    expect(secondRun.user.id).toBe(firstRun.user.id);
    expect(secondRun.membership.id).toBe(firstRun.membership.id);
    expect(secondRun.school.created).toBe(false);
    expect(secondRun.user.created).toBe(false);
    expect(secondRun.membership.created).toBe(false);

    const db = getDb();
    const schoolRows = await db.select().from(schools).where(eq(schools.slug, DEMO_CONFIG.schoolSlug));
    const userRows = await db.select().from(users).where(eq(users.phoneNumber, DEMO_MOBILE));
    const membershipRows = await db.select().from(schoolMemberships).where(eq(schoolMemberships.userId, firstRun.user.id));

    expect(schoolRows).toHaveLength(1);
    expect(userRows).toHaveLength(1);
    expect(membershipRows).toHaveLength(1);
    expect(await credentialPasswordFor(DEMO_MOBILE)).toBe(passwordAfterFirstRun);
  });

  it("preserves a profile value an operator changed", async () => {
    const db = getDb();
    await db.update(users).set({ name: "نام تغییرکرده" }).where(eq(users.id, firstRun.user.id));

    await seedDemoTenant({ environment: environment() });

    const [user] = await db.select().from(users).where(eq(users.id, firstRun.user.id));
    expect(user?.name).toBe("نام تغییرکرده");
  });

  it("restores a suspended demo membership instead of duplicating it", async () => {
    const db = getDb();
    await db
      .update(schoolMemberships)
      .set({ status: "SUSPENDED", suspendedAt: new Date() })
      .where(eq(schoolMemberships.id, firstRun.membership.id));

    const thirdRun = await seedDemoTenant({ environment: environment() });

    expect(thirdRun.membership.id).toBe(firstRun.membership.id);
    expect(thirdRun.membership.restored).toBe(true);

    const rows = await db.select().from(schoolMemberships).where(eq(schoolMemberships.userId, firstRun.user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ACTIVE");
    expect(rows[0].suspendedAt).toBeNull();
  });

  afterAll(async () => {
    if (!firstRun) return;
    const db = getDb();
    await db.delete(auditLogs).where(eq(auditLogs.schoolId, firstRun.school.id));
    await db.delete(auditLogs).where(eq(auditLogs.actorUserId, firstRun.user.id));
    await db.delete(schoolMemberships).where(eq(schoolMemberships.userId, firstRun.user.id));
    await db.delete(schoolSettings).where(eq(schoolSettings.schoolId, firstRun.school.id));
    await db.delete(schools).where(eq(schools.id, firstRun.school.id));
    await db.delete(sessions).where(eq(sessions.userId, firstRun.user.id));
    await db.delete(accounts).where(eq(accounts.userId, firstRun.user.id));
    await db.delete(users).where(eq(users.id, firstRun.user.id));
  });
});
