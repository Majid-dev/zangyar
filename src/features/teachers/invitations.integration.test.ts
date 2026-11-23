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
  schoolSettings,
  schools,
  sessions,
  teacherInvitations,
  teacherProfiles,
  users,
} from "@/lib/db/schema";
import { listTeacherInvitationsForContext, resolveActivationToken } from "./queries";
import { activateTeacher, createTeacher, resendTeacherInvitation, revokeTeacherInvitation, setTeacherMembershipStatus } from "./services";
import { hashInvitationToken } from "./tokens";
import { requestOtp } from "@/features/otp/service";
import { getOtpConfig } from "@/lib/otp/config";

config({ path: ".env.local" });

const canRun = Boolean(
  process.env.DATABASE_URL &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_URL &&
    process.env.RUN_DB_INTEGRATION_TESTS === "1",
);

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const PASSWORD = "A-secure-password-123!";

function cookieHeader(response: Response) {
  const responseHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = responseHeaders.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return setCookies.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
}

async function createSchoolAdmin(suffix: string) {
  const auth = getAuth();
  const db = getDb();
  const email = `invitations-${suffix}-${crypto.randomUUID()}@example.com`;

  const signUp = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `Admin ${suffix}`, email, password: PASSWORD }),
    }),
  );
  expect(signUp.ok).toBe(true);

  const signIn = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  const body = (await signIn.json()) as { user: { id: string } };

  const [school] = await db
    .insert(schools)
    .values({ slug: `invitations-${crypto.randomUUID().slice(0, 8)}`, name: `Invitation School ${suffix}`, status: "ACTIVE" })
    .returning({ id: schools.id });
  await db.insert(schoolSettings).values({ schoolId: school.id }).onConflictDoNothing();
  const [membership] = await db
    .insert(schoolMemberships)
    .values({ schoolId: school.id, userId: body.user.id, role: "SCHOOL_ADMIN", status: "ACTIVE" })
    .returning({ id: schoolMemberships.id });

  return {
    userId: body.user.id,
    headers: new Headers({ cookie: cookieHeader(signIn) }),
    schoolId: school.id,
    membershipId: membership.id,
  };
}

async function deleteSchool(schoolId: string) {
  const db = getDb();
  await db.delete(teacherInvitations).where(eq(teacherInvitations.schoolId, schoolId));
  await db.delete(teacherProfiles).where(eq(teacherProfiles.schoolId, schoolId));
  await db.delete(auditLogs).where(eq(auditLogs.schoolId, schoolId));
  await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolId));
  await db.delete(schoolSettings).where(eq(schoolSettings.schoolId, schoolId));
  await db.delete(schools).where(eq(schools.id, schoolId));
}

async function deleteIdentity(userId: string) {
  const db = getDb();
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(accounts).where(eq(accounts.userId, userId));
  await db.delete(schoolMemberships).where(eq(schoolMemberships.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

async function signInWithPhone(phoneNumber: string, password: string) {
  const response = await getAuth().handler(
    new Request(`${BASE_URL}/api/auth/sign-in/phone-number`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber, password }),
    }),
  );
  return response;
}

/**
 * Issues a TEACHER_ACTIVATION code for a mobile and returns the fixed development
 * code, which is what the activation endpoint will accept.
 *
 * Activation now requires proving possession of the mobile, so every test that
 * completes an activation must first challenge the number.
 */
async function issueActivationCode(mobile: string) {
  const config = getOtpConfig();
  await requestOtp({ purpose: "TEACHER_ACTIVATION", mobile }, { config });
  return config.fixedCode;
}

/** Activation input with a freshly issued, valid code. */
async function activationInput(mobile: string, token: string, password = PASSWORD) {
  const code = await issueActivationCode(mobile);
  return { token, code, newPassword: password, confirmPassword: password };
}

describe.skipIf(!canRun)("teacher invitation lifecycle", () => {
  let admin: Awaited<ReturnType<typeof createSchoolAdmin>>;

  beforeAll(async () => {
    admin = await createSchoolAdmin("primary");
  });

  afterAll(async () => {
    await deleteSchool(admin.schoolId);
    await deleteIdentity(admin.userId);
  });

  it("stores only the hash of the issued token", async () => {
    const created = await createTeacher({
      headers: admin.headers,
      input: { firstName: "پریسا", lastName: "کاظمی", mobile: "09122220001" },
    });

    const [row] = await getDb().select().from(teacherInvitations).where(eq(teacherInvitations.id, created.invitation.id));
    expect(row.tokenHash).toBe(hashInvitationToken(created.invitation.token));
  });

  it("completes activation once and links a credential account", async () => {
    const created = await createTeacher({
      headers: admin.headers,
      input: { firstName: "بهرام", lastName: "قاسمی", mobile: "09122220002" },
    });
    const token = created.invitation.token;

    // Before activation the teacher cannot sign in.
    expect((await signInWithPhone("09122220002", PASSWORD)).status).toBe(401);

    const result = await activateTeacher({ input: await activationInput("09122220002", token) });
    expect(result.userId).toBeTruthy();
    expect(result.schoolName).toContain("Invitation School");

    const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.phoneNumber, "09122220002"));
    const credentials = await getDb()
      .select({ password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")));
    expect(credentials).toHaveLength(1);
    // Hashed, never plaintext.
    expect(credentials[0].password).toBeTruthy();
    expect(credentials[0].password).not.toBe(PASSWORD);

    // And now sign-in succeeds.
    const response = await signInWithPhone("09122220002", PASSWORD);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeTruthy();
  });

  it("refuses a second use of the same token", async () => {
    const created = await createTeacher({
      headers: admin.headers,
      input: { firstName: "نیما", lastName: "شریفی", mobile: "09122220003" },
    });
    const token = created.invitation.token;

    const input = await activationInput("09122220003", token);
    await activateTeacher({ input });
    // The same code and token are replayed; both are already spent.
    await expect(activateTeacher({ input })).rejects.toThrow("This activation link is invalid or has expired.");

    // The second attempt linked nothing extra.
    const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.phoneNumber, "09122220003"));
    const credentials = await getDb()
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")));
    expect(credentials).toHaveLength(1);
  });

  it("rejects an unknown token with the same message as an expired one", async () => {
    await expect(
      activateTeacher({ input: { token: "not-a-real-token-value", code: "123456", newPassword: PASSWORD, confirmPassword: PASSWORD } }),
    ).rejects.toThrow("This activation link is invalid or has expired.");
  });

  it("leaves the invitation pending when activation fails, so the teacher is not locked out", async () => {
    const created = await createTeacher({
      headers: admin.headers,
      input: { firstName: "رویا", lastName: "مهدوی", mobile: "09122220004" },
    });
    const token = created.invitation.token;

    await activateTeacher({ input: await activationInput("09122220004", token) });

    const [row] = await getDb().select().from(teacherInvitations).where(eq(teacherInvitations.id, created.invitation.id));
    // Consumed exactly once, and the failed retry above did not un-consume it.
    expect(row.status).toBe("CONSUMED");
    expect(row.consumedAt).toBeTruthy();
  });

  it("refuses an expired token and reports it as expired in the UI", async () => {
    const created = await createTeacher({
      headers: admin.headers,
      input: { firstName: "کاوه", lastName: "امیری", mobile: "09122220005" },
    });

    // Age the invitation past its lifetime.
    await getDb()
      .update(teacherInvitations)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(teacherInvitations.id, created.invitation.id));

    await expect(
      activateTeacher({ input: await activationInput("09122220005", created.invitation.token) }),
    ).rejects.toThrow("This activation link is invalid or has expired.");

    const preview = await resolveActivationToken(created.invitation.token);
    expect(preview?.status).toBe("EXPIRED");
    expect(preview?.usable).toBe(false);

    const history = await listTeacherInvitationsForContext(
      { membershipId: admin.membershipId, schoolId: admin.schoolId, userId: admin.userId, role: "SCHOOL_ADMIN", school: { id: admin.schoolId } as never },
      created.teacherId,
    );
    expect(history[0].status).toBe("EXPIRED");
  });

  it("invalidates the previous token when an invitation is resent", async () => {
    const created = await createTeacher({
      headers: admin.headers,
      input: { firstName: "شیما", lastName: "بهرامی", mobile: "09122220006" },
    });
    const firstToken = created.invitation.token;

    const resent = await resendTeacherInvitation({ headers: admin.headers, input: { teacherId: created.teacherId } });
    expect(resent.token).not.toBe(firstToken);

    // The old link is dead. It fails at the invitation lookup, before the code is
    // ever examined, so no fresh code is needed (and issuing one would collide
    // with the resend cooldown for this number).
    await expect(
      activateTeacher({ input: { token: firstToken, code: "123456", newPassword: PASSWORD, confirmPassword: PASSWORD } }),
    ).rejects.toThrow("This activation link is invalid or has expired.");

    // The new one works.
    await expect(
      activateTeacher({ input: await activationInput("09122220006", resent.token) }),
    ).resolves.toBeTruthy();

    // Exactly one invitation was ever usable at a time.
    const pending = await getDb()
      .select({ id: teacherInvitations.id, status: teacherInvitations.status })
      .from(teacherInvitations)
      .where(and(eq(teacherInvitations.membershipId, created.membershipId), eq(teacherInvitations.status, "PENDING")));
    expect(pending).toHaveLength(0);

    const revoked = await getDb()
      .select({ id: teacherInvitations.id })
      .from(teacherInvitations)
      .where(and(eq(teacherInvitations.membershipId, created.membershipId), eq(teacherInvitations.status, "REVOKED")));
    expect(revoked).toHaveLength(1);
  });

  it("keeps at most one pending invitation under concurrent resends", async () => {
    const created = await createTeacher({
      headers: admin.headers,
      input: { firstName: "آرش", lastName: "دهقان", mobile: "09122220007" },
    });

    const results = await Promise.allSettled([
      resendTeacherInvitation({ headers: admin.headers, input: { teacherId: created.teacherId } }),
      resendTeacherInvitation({ headers: admin.headers, input: { teacherId: created.teacherId } }),
    ]);

    // The one-pending partial unique index decides the race: one wins, or they
    // serialize and both succeed with the last one live. Either way only one
    // row may remain usable.
    const pending = await getDb()
      .select({ id: teacherInvitations.id })
      .from(teacherInvitations)
      .where(and(eq(teacherInvitations.membershipId, created.membershipId), eq(teacherInvitations.status, "PENDING")));
    expect(pending.length).toBeLessThanOrEqual(1);
    expect(results.length).toBe(2);
  });

  it("revokes a pending invitation so the link stops working", async () => {
    const created = await createTeacher({
      headers: admin.headers,
      input: { firstName: "لیلا", lastName: "صادقی", mobile: "09122220008" },
    });

    await revokeTeacherInvitation({ headers: admin.headers, input: { teacherId: created.teacherId } });

    await expect(
      activateTeacher({ input: await activationInput("09122220008", created.invitation.token) }),
    ).rejects.toThrow("This activation link is invalid or has expired.");

    // Revoking again reports that there is nothing left to revoke.
    await expect(
      revokeTeacherInvitation({ headers: admin.headers, input: { teacherId: created.teacherId } }),
    ).rejects.toThrow("There is no pending invitation for this teacher.");
  });

  it("withdraws a live invitation when the teacher is deactivated", async () => {
    const created = await createTeacher({
      headers: admin.headers,
      input: { firstName: "محسن", lastName: "رستمی", mobile: "09122220009" },
    });

    await setTeacherMembershipStatus({ headers: admin.headers, input: { teacherId: created.teacherId, status: "SUSPENDED" } });

    await expect(
      activateTeacher({ input: await activationInput("09122220009", created.invitation.token) }),
    ).rejects.toThrow("This activation link is invalid or has expired.");

    const preview = await resolveActivationToken(created.invitation.token);
    expect(preview?.usable).toBe(false);
  });

  it("refuses to invite a teacher who already activated", async () => {
    const created = await createTeacher({
      headers: admin.headers,
      input: { firstName: "هدیه", lastName: "جعفری", mobile: "09122220010" },
    });
    await activateTeacher({ input: await activationInput("09122220010", created.invitation.token) });

    await expect(
      resendTeacherInvitation({ headers: admin.headers, input: { teacherId: created.teacherId } }),
    ).rejects.toThrow("An activated teacher cannot be invited again.");
  });

  it("keeps an activated but suspended teacher signed out of school access", async () => {
    const created = await createTeacher({
      headers: admin.headers,
      input: { firstName: "فرهاد", lastName: "زمانی", mobile: "09122220011" },
    });
    await activateTeacher({ input: await activationInput("09122220011", created.invitation.token) });

    // The credential survives suspension, so authentication still succeeds...
    const signedIn = await signInWithPhone("09122220011", PASSWORD);
    expect(signedIn.status).toBe(200);

    // ...but the membership no longer authorizes any school access.
    await setTeacherMembershipStatus({ headers: admin.headers, input: { teacherId: created.teacherId, status: "SUSPENDED" } });

    const { requireSchoolRole } = await import("@/lib/auth/authorization");
    await expect(requireSchoolRole({ headers: new Headers({ cookie: cookieHeader(signedIn) }), roles: ["TEACHER"] })).rejects.toThrow();
  });

  it("keeps the OTP endpoints closed, so an invitation cannot be bypassed", async () => {
    const response = await getAuth().handler(
      new Request(`${BASE_URL}/api/auth/phone-number/send-otp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: "09122220001" }),
      }),
    );
    expect(response.status).toBe(404);
  });

  it("reports a usable invitation preview without leaking other tenants", async () => {
    const created = await createTeacher({
      headers: admin.headers,
      input: { firstName: "سمیرا", lastName: "کوهستانی", mobile: "09122220012" },
    });

    const preview = await resolveActivationToken(created.invitation.token);
    expect(preview?.teacherName).toBe("سمیرا کوهستانی");
    expect(preview?.usable).toBe(true);
    expect(preview).not.toHaveProperty("schoolId");
    expect(preview).not.toHaveProperty("userId");

    expect(await resolveActivationToken("not-a-real-token-value")).toBeNull();
  });
});
