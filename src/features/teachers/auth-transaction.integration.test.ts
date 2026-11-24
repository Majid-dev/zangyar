import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";

import { getAuth, getAuthForTransaction, mobileAccountEmail } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { accounts, auditLogs, sessions, users } from "@/lib/db/schema";

config({ path: ".env.local" });

const canRun = Boolean(
  process.env.DATABASE_URL &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_URL &&
    process.env.RUN_DB_INTEGRATION_TESTS === "1",
);

/**
 * Verifies the load-bearing transaction claim: a Better Auth instance bound to an
 * open Drizzle transaction writes identity rows through the *same* connection, so
 * a later failure rolls the identity back with the domain rows.
 *
 * If this ever regresses, teacher provisioning would leave orphan users holding a
 * mobile number that can never be reused.
 */
describe.skipIf(!canRun)("auth transaction binding", () => {
  const mobile = "09990000001";
  const email = mobileAccountEmail(mobile);

  async function cleanup() {
    const db = getDb();
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.phoneNumber, mobile)).limit(1);
    if (user) {
      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, user.id));
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      await db.delete(accounts).where(eq(accounts.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  }

  beforeAll(cleanup);
  afterAll(cleanup);

  it("rolls an identity created through a transaction-bound instance back with the transaction", async () => {
    await expect(
      getDb().transaction(async (tx) => {
        const auth = getAuthForTransaction(tx);
        const context = await auth.$context;

        const created = await context.internalAdapter.createUser(
          {
            name: "Rollback Probe",
            email,
            emailVerified: false,
            image: null,
            phoneNumber: mobile,
            phoneNumberVerified: true,
          },
          { method: "phone-number" },
        );

        const linked = await context.internalAdapter.linkAccount({
          userId: created.id,
          providerId: "credential",
          accountId: created.id,
          password: await context.password.hash("A-probe-password-123!"),
        });

        // Both writes are visible inside the transaction...
        expect(linked.userId).toBe(created.id);

        // ...and then the whole thing is abandoned.
        throw new Error("forced rollback");
      }),
    ).rejects.toThrow("forced rollback");

    const db = getDb();
    const orphans = await db.select({ id: users.id }).from(users).where(eq(users.phoneNumber, mobile));
    expect(orphans).toHaveLength(0);

    const orphanAccounts = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.accountId, email));
    expect(orphanAccounts).toHaveLength(0);
  });

  it("commits when the transaction succeeds", async () => {
    const created = await getDb().transaction(async (tx) => {
      const auth = getAuthForTransaction(tx);
      const context = await auth.$context;
      return context.internalAdapter.createUser(
        {
          name: "Commit Probe",
          email,
          emailVerified: false,
          image: null,
          phoneNumber: mobile,
          phoneNumberVerified: true,
        },
        { method: "phone-number" },
      );
    });

    const [row] = await getDb().select({ id: users.id, verified: users.phoneNumberVerified }).from(users).where(eq(users.phoneNumber, mobile));
    expect(row?.id).toBe(created.id);
    expect(row?.verified).toBe(true);

    // No credential was linked, so the probe account cannot sign in through any
    // enabled endpoint — the same guarantee teacher provisioning relies on.
    const auth = getAuth();
    const response = await auth.handler(
      new Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-in/phone-number`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: mobile, password: "any-password-value" }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("keeps the phone-number plugin from storing an unverified number", async () => {
    // Guards the other half of the invariant: the plugin discards a phone unless
    // the provisioning path asserts verification, so an accidental omission can
    // never leave a signable-but-unverified account.
    const probeMobile = "09990000002";
    await getDb().transaction(async (tx) => {
      const auth = getAuthForTransaction(tx);
      const context = await auth.$context;
      await context.internalAdapter.createUser(
        {
          name: "Unverified Probe",
          email: mobileAccountEmail(probeMobile),
          emailVerified: false,
          image: null,
          phoneNumber: probeMobile,
          phoneNumberVerified: false,
        },
        { method: "phone-number" },
      );
    });

    const [row] = await getDb().select({ phoneNumber: users.phoneNumber }).from(users).where(eq(users.email, mobileAccountEmail(probeMobile)));
    expect(row?.phoneNumber).toBeNull();

    const [created] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, mobileAccountEmail(probeMobile)));
    await getDb().delete(users).where(eq(users.id, created.id));
  });
});
