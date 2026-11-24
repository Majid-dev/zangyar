import "server-only";

import { and, eq } from "drizzle-orm";

import { getAuth, mobileAccountEmail } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { schoolMemberships, schoolSettings, schools, users } from "@/lib/db/schema";
import { normalizeIranianMobile } from "@/lib/mobile";

import { getDemoSeedConfig, type DemoSeedConfig } from "./config";
import { assertDemoSeedAllowed, type DemoSeedEnvironment } from "./environment";

export type DemoSeedOutcome = {
  school: { id: string; slug: string; name: string; created: boolean };
  user: { id: string; mobile: string; name: string; created: boolean };
  membership: { id: string; role: "SCHOOL_ADMIN"; status: "ACTIVE"; created: boolean; restored: boolean };
};

function requireNormalizedMobile(value: string) {
  const normalized = normalizeIranianMobile(value);
  if (!normalized || !/^09\d{9}$/.test(normalized)) {
    throw new Error("The configured demo mobile number is not a valid Iranian mobile number.");
  }
  return normalized;
}

/**
 * Idempotent development bootstrap for the demo tenant.
 *
 * Creates the demo school, the demo School Admin account, and an active
 * SCHOOL_ADMIN membership, then returns a credential-free summary. Repeated
 * runs never duplicate a row, never reset an existing password, and never
 * overwrite a profile value an operator changed.
 *
 * This is deliberately not reachable from a Server Action or Route Handler: it
 * is a development operator tool whose environment gate runs before any write.
 */
export async function seedDemoTenant(options: {
  environment?: DemoSeedEnvironment;
  seedConfig?: DemoSeedConfig;
} = {}): Promise<DemoSeedOutcome> {
  const environment = options.environment ?? {
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    allowNonDevelopment: process.env.DEMO_SEED_ALLOW_NON_DEVELOPMENT,
  };

  // Refuse before touching the database. A rejection leaves no rows behind.
  assertDemoSeedAllowed(environment);

  const seedConfig = options.seedConfig ?? getDemoSeedConfig();
  const mobile = requireNormalizedMobile(seedConfig.adminMobile);
  const db = getDb();

  // 1. Demo school, resolved by the stable natural key `slug`.
  const [createdSchool] = await db
    .insert(schools)
    .values({
      slug: seedConfig.schoolSlug,
      name: seedConfig.schoolName,
      phone: seedConfig.schoolPhone,
      address: seedConfig.schoolAddress,
      status: "ACTIVE",
    })
    .onConflictDoNothing({ target: schools.slug })
    .returning({ id: schools.id, slug: schools.slug, name: schools.name });

  const school =
    createdSchool ??
    (
      await db
        .select({ id: schools.id, slug: schools.slug, name: schools.name })
        .from(schools)
        .where(eq(schools.slug, seedConfig.schoolSlug))
        .limit(1)
    )[0];

  if (!school) throw new Error("Demo school could not be resolved.");

  await db.insert(schoolSettings).values({ schoolId: school.id }).onConflictDoNothing();

  // 2. Demo account, resolved by the normalized mobile login identity.
  const auth = getAuth();
  const context = await auth.$context;

  const [existingUser] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.phoneNumber, mobile))
    .limit(1);

  let account = existingUser;
  let userCreated = false;

  if (!account) {
    // Hashing and phone-verification state stay owned by Better Auth; the seed
    // never writes a password column itself.
    const passwordHash = await context.password.hash(seedConfig.adminPassword);
    const created = await context.internalAdapter.createUser(
      {
        name: seedConfig.adminName,
        email: mobileAccountEmail(mobile),
        emailVerified: false,
        image: null,
        phoneNumber: mobile,
        phoneNumberVerified: true,
      },
      { method: "phone-number" },
    );

    await context.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: passwordHash,
    });

    account = { id: created.id, name: created.name };
    userCreated = true;
  }

  // 3. Membership for exactly this (school, user) pair.
  const [existingMembership] = await db
    .select({ id: schoolMemberships.id, status: schoolMemberships.status })
    .from(schoolMemberships)
    .where(and(eq(schoolMemberships.schoolId, school.id), eq(schoolMemberships.userId, account.id)))
    .limit(1);

  if (!existingMembership) {
    const [membership] = await db
      .insert(schoolMemberships)
      .values({ schoolId: school.id, userId: account.id, role: "SCHOOL_ADMIN", status: "ACTIVE" })
      .returning({ id: schoolMemberships.id });

    return {
      school: { ...school, created: Boolean(createdSchool) },
      user: { id: account.id, mobile, name: account.name, created: userCreated },
      membership: { id: membership.id, role: "SCHOOL_ADMIN", status: "ACTIVE", created: true, restored: false },
    };
  }

  // An earlier run or an operator may have suspended/revoked the demo
  // membership; restore demo access without touching the account or password.
  const restored = existingMembership.status !== "ACTIVE";

  if (restored) {
    await db
      .update(schoolMemberships)
      .set({ status: "ACTIVE", suspendedAt: null, revokedAt: null, updatedAt: new Date() })
      .where(eq(schoolMemberships.id, existingMembership.id));
  }

  return {
    school: { ...school, created: Boolean(createdSchool) },
    user: { id: account.id, mobile, name: account.name, created: userCreated },
    membership: { id: existingMembership.id, role: "SCHOOL_ADMIN", status: "ACTIVE", created: false, restored },
  };
}
