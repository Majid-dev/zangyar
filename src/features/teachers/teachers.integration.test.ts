import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";

import type { ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  accounts,
  auditLogs,
  platformAdmins,
  schoolMemberships,
  schoolSettings,
  schools,
  sessions,
  teacherProfiles,
  teacherRegistrations,
  users,
} from "@/lib/db/schema";
import { getOtpConfig } from "@/lib/otp/config";
import { listTeachersForContext, getTeacherForContext } from "./queries";
import { teacherListFilterSchema } from "./schema";
import {
  completeTeacherRegistration,
  deleteRegistration,
  registerTeacherMobile,
  requestTeacherRegistrationCode,
  setTeacherStatus,
  updateRegistrationMobile,
  updateTeacher,
} from "./services";

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

type Actor = { userId: string; headers: Headers; schoolId: string; membershipId: string };

async function createSchoolAdmin(suffix: string): Promise<Actor> {
  const auth = getAuth();
  const db = getDb();
  const email = `teachers-${suffix}-${crypto.randomUUID()}@example.com`;

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
  expect(signIn.ok).toBe(true);
  const body = (await signIn.json()) as { user: { id: string } };

  const [school] = await db
    .insert(schools)
    .values({ slug: `teachers-${suffix}-${crypto.randomUUID().slice(0, 8)}`, name: `School ${suffix}`, status: "ACTIVE" })
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

function asContext(actor: Actor): ActiveSchoolMembership {
  return {
    membershipId: actor.membershipId,
    schoolId: actor.schoolId,
    userId: actor.userId,
    role: "SCHOOL_ADMIN",
    school: { id: actor.schoolId } as ActiveSchoolMembership["school"],
  };
}

/** Registers a number and completes registration, returning the ids involved. */
async function registerAndClaim(actor: Actor, mobile: string, name = { firstName: "زهرا", lastName: "محمدی" }) {
  const registered = await registerTeacherMobile({ headers: actor.headers, input: { mobile } });
  await requestTeacherRegistrationCode({ input: { mobile } });
  const completed = await completeTeacherRegistration({
    input: { mobile, code: FIXED_CODE, password: PASSWORD, confirmPassword: PASSWORD, ...name },
  });
  return { registrationId: registered.registrationId, userId: completed.userId };
}

async function userIdFor(mobile: string) {
  const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.phoneNumber, mobile));
  return user?.id ?? null;
}

async function deleteSchool(schoolId: string) {
  const db = getDb();
  await db.delete(teacherRegistrations).where(eq(teacherRegistrations.schoolId, schoolId));
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

describe.skipIf(!canRun)("teacher registration", () => {
  let admin: Actor;
  let otherAdmin: Actor;

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

  it("authorizes a number without creating an account", async () => {
    const result = await registerTeacherMobile({
      headers: admin.headers,
      input: { mobile: "09123330001" },
    });

    const [registration] = await getDb().select().from(teacherRegistrations).where(eq(teacherRegistrations.id, result.registrationId));
    expect(registration.phoneNumber).toBe("09123330001");
    expect(registration.status).toBe("PENDING");
    expect(registration.membershipId).toBeNull();
    // The row carries no teacher detail at all: only the number the admin is
    // entitled to assert.
    expect(registration).not.toHaveProperty("personnelCode");

    // No identity and no membership exist yet: the admin only authorized a number.
    expect(await userIdFor("09123330001")).toBeNull();
    const memberships = await getDb()
      .select({ id: schoolMemberships.id })
      .from(schoolMemberships)
      .where(eq(schoolMemberships.schoolId, admin.schoolId));
    expect(memberships).toHaveLength(1); // the admin's own
  });

  it("normalizes a localized spelling before storing it", async () => {
    await registerTeacherMobile({ headers: admin.headers, input: { mobile: "+98 912 333 0002" } });
    const rows = await getDb()
      .select({ id: teacherRegistrations.id })
      .from(teacherRegistrations)
      .where(eq(teacherRegistrations.phoneNumber, "09123330002"));
    expect(rows).toHaveLength(1);
  });

  it("refuses a duplicate live number in the same school", async () => {
    await expect(
      registerTeacherMobile({ headers: admin.headers, input: { mobile: "09123330001" } }),
    ).rejects.toThrow("This mobile number is already registered at this school.");
  });

  it("allows the same number to be authorized by a different school", async () => {
    await expect(
      registerTeacherMobile({ headers: otherAdmin.headers, input: { mobile: "09123330001" } }),
    ).resolves.toBeTruthy();
  });

  it("refuses to send a code for a number no school authorized", async () => {
    const result = await requestTeacherRegistrationCode({ input: { mobile: "09123339999" } });
    expect(result.sent).toBe(false);
  });

  it("completes registration, creating one identity pending approval", async () => {
    const registered = await registerTeacherMobile({ headers: admin.headers, input: { mobile: "09123330003" } });
    expect((await requestTeacherRegistrationCode({ input: { mobile: "09123330003" } })).sent).toBe(true);

    const completed = await completeTeacherRegistration({
      input: { mobile: "09123330003", code: FIXED_CODE, firstName: "مریم", lastName: "رضایی", password: PASSWORD, confirmPassword: PASSWORD },
    });

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.phoneNumber, "09123330003"));
    expect(user.id).toBe(completed.userId);
    expect(user.name).toBe("مریم رضایی");
    // The number was proven by the code, so it is verified.
    expect(user.phoneNumberVerified).toBe(true);

    const [membership] = await db
      .select()
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.userId, user.id), eq(schoolMemberships.schoolId, admin.schoolId)));
    expect(membership.role).toBe("TEACHER");
    // Access is not granted by registering.
    expect(membership.status).toBe("PENDING_ADMIN_APPROVAL");

    const [profile] = await db.select().from(teacherProfiles).where(eq(teacherProfiles.membershipId, membership.id));
    expect(profile.firstName).toBe("مریم");
    expect(profile.personnelCode).toBeNull();

    const [registration] = await db.select().from(teacherRegistrations).where(eq(teacherRegistrations.id, registered.registrationId));
    expect(registration.status).toBe("CLAIMED");
    expect(registration.membershipId).toBe(membership.id);
  });

  it("stores the password hashed on the identity it created", async () => {
    const userId = (await userIdFor("09123330003"))!;
    const [credential] = await getDb()
      .select({ password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
    expect(credential.password).toBeTruthy();
    expect(credential.password).not.toBe(PASSWORD);
    expect(credential.password!.length).toBeGreaterThan(40);
  });

  it("grants no platform privilege", async () => {
    const userId = (await userIdFor("09123330003"))!;
    const rows = await getDb().select().from(platformAdmins).where(eq(platformAdmins.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it("refuses registration with a wrong code and leaves nothing behind", async () => {
    await registerTeacherMobile({ headers: admin.headers, input: { mobile: "09123330004" } });
    await requestTeacherRegistrationCode({ input: { mobile: "09123330004" } });

    await expect(
      completeTeacherRegistration({
        input: { mobile: "09123330004", code: "000000", firstName: "کاوه", lastName: "امیری", password: PASSWORD, confirmPassword: PASSWORD },
      }),
    ).rejects.toThrow("The verification code is invalid or has expired.");

    // A failed attempt must not create an identity.
    expect(await userIdFor("09123330004")).toBeNull();
  });

  it("refuses completion for a number with no authorization, even with a valid code", async () => {
    // A code issued for a number is not itself authorization.
    await expect(
      completeTeacherRegistration({
        input: { mobile: "09123339998", code: FIXED_CODE, firstName: "بدون", lastName: "مجوز", password: PASSWORD, confirmPassword: PASSWORD },
      }),
    ).rejects.toThrow("The verification code is invalid or has expired.");
  });

  it("creates one identity with a membership per authorizing school", async () => {
    const mobile = "09123330005";
    await registerTeacherMobile({ headers: admin.headers, input: { mobile } });
    await registerTeacherMobile({ headers: otherAdmin.headers, input: { mobile } });
    await requestTeacherRegistrationCode({ input: { mobile } });
    const completed = await completeTeacherRegistration({
      input: { mobile, code: FIXED_CODE, firstName: "سمیرا", lastName: "کوهستانی", password: PASSWORD, confirmPassword: PASSWORD },
    });

    // One identity...
    const identities = await getDb().select({ id: users.id }).from(users).where(eq(users.phoneNumber, mobile));
    expect(identities).toHaveLength(1);
    expect(identities[0].id).toBe(completed.userId);
    expect(new Set(completed.schoolNames)).toEqual(new Set(["School primary", "School other"]));

    // ...and a pending membership at each authorizing school.
    const memberships = await getDb()
      .select({ schoolId: schoolMemberships.schoolId, role: schoolMemberships.role, status: schoolMemberships.status })
      .from(schoolMemberships)
      .where(eq(schoolMemberships.userId, completed.userId));
    expect(memberships).toHaveLength(2);
    for (const membership of memberships) {
      expect(membership.role).toBe("TEACHER");
      expect(membership.status).toBe("PENDING_ADMIN_APPROVAL");
    }
  });

  it("approves a registered teacher, granting access", async () => {
    const userId = (await userIdFor("09123330003"))!;
    const [registration] = await getDb()
      .select({ id: teacherRegistrations.id })
      .from(teacherRegistrations)
      .where(and(eq(teacherRegistrations.schoolId, admin.schoolId), eq(teacherRegistrations.phoneNumber, "09123330003")));

    const result = await setTeacherStatus({ headers: admin.headers, input: { registrationId: registration.id, status: "ACTIVE" } });
    expect(result.decision).toBe("APPROVED");

    const [membership] = await getDb()
      .select({ status: schoolMemberships.status })
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.schoolId, admin.schoolId)));
    expect(membership.status).toBe("ACTIVE");
  });

  it("refuses to approve an already-approved teacher", async () => {
    const [registration] = await getDb()
      .select({ id: teacherRegistrations.id })
      .from(teacherRegistrations)
      .where(and(eq(teacherRegistrations.schoolId, admin.schoolId), eq(teacherRegistrations.phoneNumber, "09123330003")));

    // Approval and activation are one transition, so activating an already-active
    // teacher is the same illegal move as approving them twice.
    await expect(
      setTeacherStatus({ headers: admin.headers, input: { registrationId: registration.id, status: "ACTIVE" } }),
    ).rejects.toThrow("Invalid teacher status transition: ACTIVE to ACTIVE.");
  });

  it("refuses to approve a registration that has not been claimed", async () => {
    const registered = await registerTeacherMobile({ headers: admin.headers, input: { mobile: "09123330006" } });
    await expect(
      setTeacherStatus({ headers: admin.headers, input: { registrationId: registered.registrationId, status: "ACTIVE" } }),
    ).rejects.toThrow("This teacher has not registered yet.");
  });

  it("rejects a registration without granting access", async () => {
    const { registrationId, userId } = await registerAndClaim(admin, "09123330007", { firstName: "نازنین", lastName: "احمدی" });

    const result = await setTeacherStatus({ headers: admin.headers, input: { registrationId, status: "REJECTED" } });
    expect(result.decision).toBe("REJECTED");

    const [membership] = await getDb()
      .select({ status: schoolMemberships.status })
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.schoolId, admin.schoolId)));
    expect(membership.status).toBe("REJECTED");
  });

  it("re-admits a rejected teacher by approving them", async () => {
    const userId = (await userIdFor("09123330007"))!;
    const [registration] = await getDb()
      .select({ id: teacherRegistrations.id })
      .from(teacherRegistrations)
      .where(and(eq(teacherRegistrations.schoolId, admin.schoolId), eq(teacherRegistrations.phoneNumber, "09123330007")));

    // Undoing a rejection is the approval transition, not a separate workflow.
    const result = await setTeacherStatus({ headers: admin.headers, input: { registrationId: registration.id, status: "ACTIVE" } });
    expect(result.decision).toBe("APPROVED");

    const [membership] = await getDb()
      .select({ status: schoolMemberships.status })
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.schoolId, admin.schoolId)));
    expect(membership.status).toBe("ACTIVE");
  });

  it("deactivates and reactivates an approved teacher", async () => {
    const userId = (await userIdFor("09123330003"))!;
    const [registration] = await getDb()
      .select({ id: teacherRegistrations.id })
      .from(teacherRegistrations)
      .where(and(eq(teacherRegistrations.schoolId, admin.schoolId), eq(teacherRegistrations.phoneNumber, "09123330003")));

    const deactivated = await setTeacherStatus({ headers: admin.headers, input: { registrationId: registration.id, status: "SUSPENDED" } });
    expect(deactivated.decision).toBe("DEACTIVATED");
    let [membership] = await getDb()
      .select({ status: schoolMemberships.status, suspendedAt: schoolMemberships.suspendedAt })
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.schoolId, admin.schoolId)));
    expect(membership.status).toBe("SUSPENDED");
    expect(membership.suspendedAt).toBeTruthy();

    const reactivated = await setTeacherStatus({ headers: admin.headers, input: { registrationId: registration.id, status: "ACTIVE" } });
    expect(reactivated.decision).toBe("REACTIVATED");
    [membership] = await getDb()
      .select({ status: schoolMemberships.status, suspendedAt: schoolMemberships.suspendedAt })
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.schoolId, admin.schoolId)));
    expect(membership.status).toBe("ACTIVE");
    expect(membership.suspendedAt).toBeNull();
  });

  it("refuses a status change the transition matrix does not allow", async () => {
    const [registration] = await getDb()
      .select({ id: teacherRegistrations.id })
      .from(teacherRegistrations)
      .where(and(eq(teacherRegistrations.schoolId, admin.schoolId), eq(teacherRegistrations.phoneNumber, "09123330003")));

    // An active teacher cannot be rejected: rejection is a decision about a
    // registration, and there is a separate deactivation for ending access.
    await expect(
      setTeacherStatus({ headers: admin.headers, input: { registrationId: registration.id, status: "REJECTED" } }),
    ).rejects.toThrow("Invalid teacher status transition: ACTIVE to REJECTED.");
  });

  it("records the decision on the audit trail", async () => {
    const [registration] = await getDb()
      .select({ id: teacherRegistrations.id })
      .from(teacherRegistrations)
      .where(and(eq(teacherRegistrations.schoolId, admin.schoolId), eq(teacherRegistrations.phoneNumber, "09123330007")));

    // Every transition writes the same action, so the interesting content is the
    // decision and the status pair it moved between.
    const events = await getDb()
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(eq(auditLogs.schoolId, admin.schoolId), eq(auditLogs.action, "TEACHER_STATUS_CHANGED")));

    expect(events.map((event) => event.metadata)).toContainEqual(
      expect.objectContaining({ decision: "APPROVED", from: "REJECTED", to: "ACTIVE" }),
    );
    expect(registration.id).toBeTruthy();
  });

  it("corrects a mobile number before registration", async () => {
    const registered = await registerTeacherMobile({ headers: admin.headers, input: { mobile: "09123330008" } });
    await updateRegistrationMobile({ headers: admin.headers, input: { registrationId: registered.registrationId, mobile: "09123330009" } });

    const [registration] = await getDb().select().from(teacherRegistrations).where(eq(teacherRegistrations.id, registered.registrationId));
    expect(registration.phoneNumber).toBe("09123330009");
  });

  it("refuses to correct the mobile number once registered", async () => {
    const [registration] = await getDb()
      .select({ id: teacherRegistrations.id })
      .from(teacherRegistrations)
      .where(and(eq(teacherRegistrations.schoolId, admin.schoolId), eq(teacherRegistrations.phoneNumber, "09123330003")));

    await expect(
      updateRegistrationMobile({ headers: admin.headers, input: { registrationId: registration.id, mobile: "09123330111" } }),
    ).rejects.toThrow("A registered teacher's mobile number cannot be changed here.");
  });

  it("deletes an unclaimed registration but refuses once claimed", async () => {
    const db = getDb();
    const countMemberships = async () =>
      (await db.select({ id: schoolMemberships.id }).from(schoolMemberships).where(eq(schoolMemberships.schoolId, admin.schoolId))).length;
    const countProfiles = async () =>
      (await db.select({ id: teacherProfiles.id }).from(teacherProfiles).where(eq(teacherProfiles.schoolId, admin.schoolId))).length;

    const unclaimed = await registerTeacherMobile({ headers: admin.headers, input: { mobile: "09123330010" } });
    const membershipsBefore = await countMemberships();
    const profilesBefore = await countProfiles();

    await deleteRegistration({ headers: admin.headers, input: { registrationId: unclaimed.registrationId } });

    // The row is gone, not flagged: the record was the admin's own assertion about
    // a number nobody had claimed.
    const remaining = await db.select({ id: teacherRegistrations.id }).from(teacherRegistrations).where(eq(teacherRegistrations.id, unclaimed.registrationId));
    expect(remaining).toHaveLength(0);

    // Nothing was orphaned or destroyed: an unclaimed row has no membership and no
    // profile, so no other teacher's rows moved either.
    expect(await countMemberships()).toBe(membershipsBefore);
    expect(await countProfiles()).toBe(profilesBefore);

    // The withdrawal is still on the audit trail, which is now the only record of
    // it — the creation event for the same id survives alongside it.
    const events = await db
      .select({ action: auditLogs.action, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(eq(auditLogs.schoolId, admin.schoolId), eq(auditLogs.entityId, unclaimed.registrationId)));
    const deletion = events.find((event) => event.action === "TEACHER_REGISTRATION_DELETED");
    expect(deletion?.metadata).toMatchObject({ mobileLastFour: "0010" });
    expect(events.map((event) => event.action)).toContain("TEACHER_REGISTRATION_CREATED");

    // A deleted number can be authorized again.
    await expect(registerTeacherMobile({ headers: admin.headers, input: { mobile: "09123330010" } })).resolves.toBeTruthy();

    const [claimed] = await db
      .select({ id: teacherRegistrations.id })
      .from(teacherRegistrations)
      .where(and(eq(teacherRegistrations.schoolId, admin.schoolId), eq(teacherRegistrations.phoneNumber, "09123330003")));
    await expect(
      deleteRegistration({ headers: admin.headers, input: { registrationId: claimed.id } }),
    ).rejects.toThrow("A registered teacher cannot be deleted here. Deactivate them instead.");
  });

  it("lists every authorized number and filters by status", async () => {
    const context = asContext(admin);

    const all = await listTeachersForContext(context, teacherListFilterSchema.parse({ pageSize: 100 }));
    expect(all.rows.length).toBeGreaterThan(0);
    // Every row belongs to this school.
    const schoolRegistrations = await getDb()
      .select({ id: teacherRegistrations.id })
      .from(teacherRegistrations)
      .where(eq(teacherRegistrations.schoolId, admin.schoolId));
    expect(all.total).toBe(schoolRegistrations.length);

    const pending = await listTeachersForContext(context, teacherListFilterSchema.parse({ status: "PENDING_REGISTRATION", pageSize: 100 }));
    for (const row of pending.rows) expect(row.displayStatus).toBe("PENDING_REGISTRATION");
    expect(pending.rows.length).toBeGreaterThan(0);

    const active = await listTeachersForContext(context, teacherListFilterSchema.parse({ status: "ACTIVE", pageSize: 100 }));
    for (const row of active.rows) {
      expect(row.displayStatus).toBe("ACTIVE");
      expect(row.membershipStatus).toBe("ACTIVE");
    }
  });

  it("shows an unregistered row with no name and no verification state", async () => {
    const context = asContext(admin);
    const rows = await listTeachersForContext(context, teacherListFilterSchema.parse({ mobile: "09123330009", pageSize: 100 }));
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].firstName).toBeNull();
    expect(rows.rows[0].mobileVerified).toBeNull();
    expect(rows.rows[0].displayStatus).toBe("PENDING_REGISTRATION");
  });

  it("searches by name, mobile, and personnel code", async () => {
    const context = asContext(admin);

    const byName = await listTeachersForContext(context, teacherListFilterSchema.parse({ name: "کوهستانی", pageSize: 100 }));
    expect(byName.rows.map((row) => row.phoneNumber)).toContain("09123330005");

    const byMobile = await listTeachersForContext(context, teacherListFilterSchema.parse({ mobile: "09123330009", pageSize: 100 }));
    expect(byMobile.rows).toHaveLength(1);

    await registerTeacherMobile({ headers: admin.headers, input: { mobile: "09123330012" } });
    await requestTeacherRegistrationCode({ input: { mobile: "09123330012" } });
    await completeTeacherRegistration({
      input: { mobile: "09123330012", code: FIXED_CODE, firstName: "پریسا", lastName: "شریفی", personnelCode: "P-7788", password: PASSWORD, confirmPassword: PASSWORD },
    });
    const byCode = await listTeachersForContext(context, teacherListFilterSchema.parse({ personnelCode: "P-7788", pageSize: 100 }));
    expect(byCode.rows.map((row) => row.phoneNumber)).toContain("09123330012");
  });

  it("stores the personnel code the teacher supplied on their profile", async () => {
    const userId = (await userIdFor("09123330012"))!;
    const [profile] = await getDb()
      .select({ personnelCode: teacherProfiles.personnelCode })
      .from(teacherProfiles)
      .innerJoin(schoolMemberships, eq(schoolMemberships.id, teacherProfiles.membershipId))
      .where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.schoolId, admin.schoolId)));

    expect(profile.personnelCode).toBe("P-7788");
  });

  it("registers without a personnel code when the school issues none", async () => {
    const { registrationId, userId } = await registerAndClaim(admin, "09123330013", { firstName: "حسن", lastName: "نوری" });

    const [profile] = await getDb()
      .select({ personnelCode: teacherProfiles.personnelCode })
      .from(teacherProfiles)
      .innerJoin(schoolMemberships, eq(schoolMemberships.id, teacherProfiles.membershipId))
      .where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.schoolId, admin.schoolId)));

    expect(profile.personnelCode).toBeNull();
    expect(registrationId).toBeTruthy();
  });

  it("updates the teacher's details and the account name together", async () => {
    const userId = (await userIdFor("09123330003"))!;
    const [registration] = await getDb()
      .select({ id: teacherRegistrations.id })
      .from(teacherRegistrations)
      .where(and(eq(teacherRegistrations.schoolId, admin.schoolId), eq(teacherRegistrations.phoneNumber, "09123330003")));

    await updateTeacher({
      headers: admin.headers,
      input: { registrationId: registration.id, firstName: "مریم", lastName: "رضایی‌نژاد", personnelCode: "T-900" },
    });

    const [user] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, userId));
    expect(user.name).toBe("مریم رضایی‌نژاد");
    const [profile] = await getDb()
      .select({ lastName: teacherProfiles.lastName, personnelCode: teacherProfiles.personnelCode })
      .from(teacherProfiles)
      .where(eq(teacherProfiles.membershipId, (await getDb().select({ id: schoolMemberships.id }).from(schoolMemberships).where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.schoolId, admin.schoolId))))[0].id));
    expect(profile.lastName).toBe("رضایی‌نژاد");
    expect(profile.personnelCode).toBe("T-900");
  });

  it("keeps registrations isolated between tenants", async () => {
    const [foreign] = await getDb()
      .select({ id: teacherRegistrations.id })
      .from(teacherRegistrations)
      .where(eq(teacherRegistrations.schoolId, otherAdmin.schoolId))
      .limit(1);

    // Another school's registration is invisible, and cannot be acted on.
    expect(await getTeacherForContext(asContext(admin), foreign.id)).toBeNull();
    await expect(
      setTeacherStatus({ headers: admin.headers, input: { registrationId: foreign.id, status: "ACTIVE" } }),
    ).rejects.toThrow("This teacher has not registered yet.");
    // Nor can it be deleted: the row is resolved through the acting admin's school.
    await expect(
      deleteRegistration({ headers: admin.headers, input: { registrationId: foreign.id } }),
    ).rejects.toThrow("Teacher registration not found.");
  });

  it("cannot insert a registration pointing at another school's membership", async () => {
    // The composite foreign key is what prevents this, not application code.
    await expect(
      getDb().insert(teacherRegistrations).values({
        schoolId: admin.schoolId,
        phoneNumber: "09123339990",
        status: "CLAIMED",
        membershipId: (await getDb().select({ id: schoolMemberships.id }).from(schoolMemberships).where(eq(schoolMemberships.schoolId, otherAdmin.schoolId)).limit(1))[0].id,
        createdByUserId: admin.userId,
      }),
    ).rejects.toThrow();
  });
});
