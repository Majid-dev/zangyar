import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";

import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  accounts,
  auditLogs,
  otpChallenges,
  schoolMemberships,
  schoolSettings,
  schools,
  sessions,
  teacherProfiles,
  users,
} from "@/lib/db/schema";
import { getOtpConfig } from "@/lib/otp/config";
import { hashOtpCode } from "@/lib/otp/code";
import { OtpError, requestOtp, verifyOtp } from "./service";

config({ path: ".env.local" });

const canRun = Boolean(
  process.env.DATABASE_URL &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_URL &&
    process.env.RUN_DB_INTEGRATION_TESTS === "1",
);

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const PASSWORD = "A-secure-password-123!";
const FIXED_CODE = getOtpConfig().fixedCode;

function cookieHeader(response: Response) {
  const responseHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = responseHeaders.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return setCookies.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
}

async function post(path: string, body: Record<string, unknown>) {
  return getAuth().handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function createSchoolAdmin(suffix: string) {
  const auth = getAuth();
  const db = getDb();
  const email = `otp-${suffix}-${crypto.randomUUID()}@example.com`;

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
    .values({ slug: `otp-${crypto.randomUUID().slice(0, 8)}`, name: `OTP School ${suffix}`, status: "ACTIVE" })
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
  await db.delete(otpChallenges).where(eq(otpChallenges.schoolId, schoolId));
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

describe.skipIf(!canRun)("OTP verification service", () => {
  let admin: Awaited<ReturnType<typeof createSchoolAdmin>>;
  let otherAdmin: Awaited<ReturnType<typeof createSchoolAdmin>>;

  beforeAll(async () => {
    admin = await createSchoolAdmin("primary");
    otherAdmin = await createSchoolAdmin("other");
  });

  afterAll(async () => {
    for (const actor of [admin, otherAdmin]) {
      await deleteSchool(actor.schoolId);
      await deleteIdentity(actor.userId);
    }
  });

  it("stores only a keyed hash of the code, never the code", async () => {
    await requestOtp({ purpose: "TEACHER_REGISTRATION", mobile: "09125550001" });

    const [row] = await getDb()
      .select()
      .from(otpChallenges)
      .where(eq(otpChallenges.phoneNumber, "09125550001"));

    expect(row.codeHash).toHaveLength(64);
    expect(row.codeHash).not.toBe(FIXED_CODE);
    // The plaintext code appears nowhere in the row.
    expect(JSON.stringify(row)).not.toContain(FIXED_CODE);
    expect(row.codeHash).toBe(hashOtpCode(FIXED_CODE, getOtpConfig().hashSecret));
    expect(row.provider).toBe("development");
    expect(row.status).toBe("PENDING");
    expect(row.attemptCount).toBe(0);
  });

  it("normalizes the mobile before keying the challenge", async () => {
    await requestOtp({ purpose: "LOGIN", mobile: "+98 912 555 0002" });
    const rows = await getDb()
      .select({ phoneNumber: otpChallenges.phoneNumber })
      .from(otpChallenges)
      .where(eq(otpChallenges.phoneNumber, "09125550002"));
    expect(rows).toHaveLength(1);
  });

  it("accepts the correct code once and refuses a replay", async () => {
    await requestOtp({ purpose: "LOGIN", mobile: "09125550003" });

    const first = await verifyOtp({ purpose: "LOGIN", mobile: "09125550003", code: FIXED_CODE });
    expect(first.phoneNumber).toBe("09125550003");

    // One-time: the second attempt finds no pending challenge.
    await expect(verifyOtp({ purpose: "LOGIN", mobile: "09125550003", code: FIXED_CODE })).rejects.toThrow(OtpError);
  });

  it("refuses a wrong code and reports the same message as a missing one", async () => {
    await requestOtp({ purpose: "LOGIN", mobile: "09125550004" });

    const wrong = await verifyOtp({ purpose: "LOGIN", mobile: "09125550004", code: "000000" }).catch((error: unknown) => error);
    const absent = await verifyOtp({ purpose: "LOGIN", mobile: "09125559999", code: FIXED_CODE }).catch((error: unknown) => error);

    expect(wrong).toBeInstanceOf(OtpError);
    expect(absent).toBeInstanceOf(OtpError);
    // Identical text: the response must not reveal which situation applied.
    expect((wrong as OtpError).message).toBe((absent as OtpError).message);
  });

  it("counts wrong attempts and exhausts the challenge at the ceiling", async () => {
    const config = getOtpConfig();
    await requestOtp({ purpose: "LOGIN", mobile: "09125550005" });

    const max = config.policies.LOGIN.maxAttempts;
    for (let attempt = 0; attempt < max; attempt += 1) {
      await expect(verifyOtp({ purpose: "LOGIN", mobile: "09125550005", code: "000000" })).rejects.toThrow(OtpError);
    }

    const [row] = await getDb()
      .select()
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phoneNumber, "09125550005"), eq(otpChallenges.purpose, "LOGIN")));
    expect(row.status).toBe("EXHAUSTED");
    expect(row.attemptCount).toBe(max);

    // Even the correct code no longer works once exhausted.
    await expect(verifyOtp({ purpose: "LOGIN", mobile: "09125550005", code: FIXED_CODE })).rejects.toThrow(OtpError);
  });

  it("refuses an expired code and marks the challenge revoked", async () => {
    await requestOtp({ purpose: "LOGIN", mobile: "09125550006" });

    // Age the challenge past its lifetime.
    await getDb()
      .update(otpChallenges)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(otpChallenges.phoneNumber, "09125550006"), eq(otpChallenges.purpose, "LOGIN")));

    await expect(verifyOtp({ purpose: "LOGIN", mobile: "09125550006", code: FIXED_CODE })).rejects.toThrow(OtpError);

    const [row] = await getDb()
      .select()
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phoneNumber, "09125550006"), eq(otpChallenges.purpose, "LOGIN")));
    expect(row.status).toBe("REVOKED");
  });

  it("keeps purposes separate, so a code for one flow cannot satisfy another", async () => {
    await requestOtp({ purpose: "LOGIN", mobile: "09125550007" });

    // The same number and the same fixed code, but the wrong purpose.
    await expect(
      verifyOtp({ purpose: "TEACHER_REGISTRATION", mobile: "09125550007", code: FIXED_CODE }),
    ).rejects.toThrow(OtpError);

    // The intended purpose still works, so the challenge was untouched.
    await expect(verifyOtp({ purpose: "LOGIN", mobile: "09125550007", code: FIXED_CODE })).resolves.toBeTruthy();
  });

  it("invalidates the previous code when a new one is requested", async () => {
    const config = { ...getOtpConfig(), policies: {} as never };
    // A fresh config with no cooldown, so the resend is allowed immediately.
    const relaxed = {
      ...getOtpConfig(),
      policies: Object.fromEntries(
        Object.entries(getOtpConfig().policies).map(([key, value]) => [key, { ...value, resendCooldownSeconds: 0 }]),
      ) as ReturnType<typeof getOtpConfig>["policies"],
    };
    void config;

    const first = await requestOtp({ purpose: "LOGIN", mobile: "09125550008" }, { config: relaxed });
    const second = await requestOtp({ purpose: "LOGIN", mobile: "09125550008" }, { config: relaxed });
    expect(second.challengeId).not.toBe(first.challengeId);

    const pending = await getDb()
      .select({ id: otpChallenges.id, status: otpChallenges.status })
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phoneNumber, "09125550008"), eq(otpChallenges.status, "PENDING")));
    // Exactly one live challenge, and only the newest can be used.
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(second.challengeId);
  });

  it("enforces the resend cooldown", async () => {
    await requestOtp({ purpose: "LOGIN", mobile: "09125550009" });

    const refusal = await requestOtp({ purpose: "LOGIN", mobile: "09125550009" }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(OtpError);
    expect((refusal as OtpError).code).toBe("COOLDOWN");
    expect((refusal as OtpError).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows a resend once the cooldown has passed", async () => {
    const config = getOtpConfig();
    await requestOtp({ purpose: "LOGIN", mobile: "09125550010" }, { config });

    // Simulate the window elapsing by dating the challenge backwards.
    const past = new Date(Date.now() - config.policies.LOGIN.resendCooldownSeconds * 1000 - 5000);
    await getDb()
      .update(otpChallenges)
      .set({ createdAt: past })
      .where(and(eq(otpChallenges.phoneNumber, "09125550010"), eq(otpChallenges.purpose, "LOGIN")));

    await expect(requestOtp({ purpose: "LOGIN", mobile: "09125550010" }, { config })).resolves.toBeTruthy();
  });

  it("enforces the per-number request rate limit across purposes", async () => {
    const base = getOtpConfig();
    // Cooldown off so the rate limiter is what refuses, and a small ceiling so the
    // window is reached deliberately.
    const config = {
      ...base,
      requestMax: 3,
      requestWindowSeconds: 3600,
      policies: Object.fromEntries(
        Object.entries(base.policies).map(([key, value]) => [key, { ...value, resendCooldownSeconds: 0 }]),
      ) as typeof base.policies,
    };

    const mobile = "09125550011";
    await requestOtp({ purpose: "LOGIN", mobile }, { config });
    await requestOtp({ purpose: "PASSWORD_RESET", mobile }, { config });
    await requestOtp({ purpose: "TEACHER_REGISTRATION", mobile }, { config });

    const refusal = await requestOtp({ purpose: "LOGIN", mobile }, { config }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(OtpError);
    expect((refusal as OtpError).code).toBe("RATE_LIMITED");
  });

  it("refuses an invalid mobile instead of keying a challenge on it", async () => {
    const refusal = await requestOtp({ purpose: "LOGIN", mobile: "0812345678" }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(OtpError);
    expect((refusal as OtpError).code).toBe("INVALID_MOBILE");
  });

  it("links a challenge to a membership and cannot cross tenants", async () => {
    await requestOtp({
      purpose: "TEACHER_REGISTRATION",
      mobile: "09125550012",
      schoolId: admin.schoolId,
      membershipId: admin.membershipId,
    });

    const [row] = await getDb()
      .select({ schoolId: otpChallenges.schoolId, membershipId: otpChallenges.membershipId })
      .from(otpChallenges)
      .where(eq(otpChallenges.phoneNumber, "09125550012"));
    expect(row.schoolId).toBe(admin.schoolId);
    expect(row.membershipId).toBe(admin.membershipId);

    // A challenge whose school disagrees with the membership is impossible: the
    // composite foreign key rejects it even though both ids are individually valid.
    await expect(
      getDb().insert(otpChallenges).values({
        purpose: "TEACHER_REGISTRATION",
        phoneNumber: "09125550013",
        codeHash: hashOtpCode(FIXED_CODE, getOtpConfig().hashSecret),
        maxAttempts: 3,
        expiresAt: new Date(Date.now() + 60_000),
        provider: "development",
        schoolId: otherAdmin.schoolId,
        membershipId: admin.membershipId,
      }),
    ).rejects.toThrow();
  });

  it("keeps codes out of the audit trail", async () => {
    const audits = await getDb().select().from(auditLogs);
    expect(JSON.stringify(audits)).not.toContain(FIXED_CODE);
    expect(JSON.stringify(audits)).not.toContain(getOtpConfig().hashSecret);
  });
});

describe.skipIf(!canRun)("OTP HTTP endpoints", () => {
  it("refuses TEACHER_REGISTRATION, which is served by the teacher feature", async () => {
    // Registration eligibility is "an admin authorized this number", which only the
    // teacher feature knows. These endpoints must not issue a code for it, or a
    // number no school authorized could be challenged.
    const response = await post("/otp/request", { purpose: "TEACHER_REGISTRATION", mobile: "09125551001" });
    expect(response.status).toBe(400);
  });

  it("reports the same success for an unknown number on a non-revealing purpose", async () => {
    const unknown = await post("/otp/request", { purpose: "LOGIN", mobile: "09125559998" });
    const known = await post("/otp/request", { purpose: "LOGIN", mobile: "09125551002" });

    // No enumeration: identical shape and status whether or not the number exists.
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
  });

  it("verifies a code issued directly through the service", async () => {
    // The registration purpose is not served by these endpoints (it is issued by
    // the teacher feature, which knows the eligibility rule), so the challenge is
    // created through the service and only the verification goes over HTTP.
    await requestOtp({ purpose: "TEACHER_REGISTRATION", mobile: "09125551003" });

    const wrong = await post("/otp/verify", { purpose: "TEACHER_REGISTRATION", mobile: "09125551003", code: "000000" });
    expect(wrong.status).toBe(400);

    const right = await post("/otp/verify", { purpose: "TEACHER_REGISTRATION", mobile: "09125551003", code: FIXED_CODE });
    expect(right.status).toBe(200);
  });

  it("logs a user in with a LOGIN code and sets a session cookie", async () => {
    // Use an account that exists and is phone-verified: the demo-style flow.
    const mobile = "09125551004";
    const auth = getAuth();
    const context = await auth.$context;
    await context.internalAdapter.createUser(
      {
        name: "OTP Login Probe",
        email: `${mobile}@mobile.zangyar.local`,
        emailVerified: false,
        image: null,
        phoneNumber: mobile,
        phoneNumberVerified: true,
      },
      { method: "phone-number" },
    );

    await post("/otp/request", { purpose: "LOGIN", mobile });
    const response = await post("/otp/login", { mobile, code: FIXED_CODE });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeTruthy();

    const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.phoneNumber, mobile));
    await deleteIdentity(user.id);
  });

  it("refuses a TEACHER_REGISTRATION code at the login endpoint", async () => {
    await requestOtp({ purpose: "TEACHER_REGISTRATION", mobile: "09125551005" });

    // Purpose-scoped: a code obtained for registration cannot mint a session.
    const response = await post("/otp/login", { mobile: "09125551005", code: FIXED_CODE });
    expect(response.status).toBe(401);
  });

  it("throttles a single number through the service", async () => {
    // Better Auth's own rate limiting is enabled only in production, so the
    // endpoint-level throttle cannot be exercised here. What actually bounds a
    // target in every environment is the per-number cooldown, so that is what is
    // asserted — through the service, since the endpoint only serves account-bound
    // purposes and this number has no account.
    const mobile = "09125552001";
    await requestOtp({ purpose: "TEACHER_REGISTRATION", mobile });

    const refusal = await requestOtp({ purpose: "TEACHER_REGISTRATION", mobile }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(OtpError);
    expect((refusal as OtpError).code).toBe("COOLDOWN");
  });

  it("keeps Better Auth's own phone-number OTP endpoints closed", async () => {
    // The plugin's storage is plaintext and purpose-less, so its routes stay
    // disabled; verification is served by /otp/* instead.
    const response = await post("/phone-number/send-otp", { phoneNumber: "09125551006" });
    expect(response.status).toBe(404);
  });
});
