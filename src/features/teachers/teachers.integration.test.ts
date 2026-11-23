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
  teacherInvitations,
  teacherProfiles,
  users,
} from "@/lib/db/schema";
import { getTeacherForContext, listTeachersForContext } from "./queries";
import { teacherListFilterSchema } from "./schema";
import { createTeacher, setTeacherMembershipStatus, updateTeacher } from "./services";

config({ path: ".env.local" });

const canRun = Boolean(
  process.env.DATABASE_URL &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_URL &&
    process.env.RUN_DB_INTEGRATION_TESTS === "1",
);

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

function cookieHeader(response: Response) {
  const responseHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = responseHeaders.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return setCookies.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
}

type Actor = { userId: string; headers: Headers; schoolId: string; membershipId: string };

/** Creates an authenticated School Admin owning a freshly created school. */
async function createSchoolAdmin(suffix: string): Promise<Actor> {
  const auth = getAuth();
  const db = getDb();
  const email = `teachers-${suffix}-${crypto.randomUUID()}@example.com`;
  const password = "A-secure-password-123!";

  const signUp = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `Admin ${suffix}`, email, password }),
    }),
  );
  expect(signUp.ok).toBe(true);

  const signIn = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
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

async function userIdFor(mobile: string) {
  const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.phoneNumber, mobile));
  return user?.id ?? null;
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

describe.skipIf(!canRun)("teacher provisioning", () => {
  let admin: Actor;
  let otherAdmin: Actor;

  beforeAll(async () => {
    admin = await createSchoolAdmin("primary");
    otherAdmin = await createSchoolAdmin("other");
  });

  afterAll(async () => {
    for (const schoolId of [admin.schoolId, otherAdmin.schoolId]) await deleteSchool(schoolId);
    for (const userId of [admin.userId, otherAdmin.userId]) await deleteIdentity(userId);
  });

  it("provisions a teacher with a profile, a TEACHER membership, and a pending invitation", async () => {
    const result = await createTeacher({
      headers: admin.headers,
      input: { firstName: "زهرا", lastName: "محمدی", mobile: "09121110001", personnelCode: "T-101" },
    });

    const userId = await userIdFor("09121110001");
    expect(userId).toBeTruthy();

    const [user] = await getDb().select().from(users).where(eq(users.id, userId!));
    expect(user.phoneNumberVerified).toBe(true);
    expect(user.name).toBe("زهرا محمدی");

    const [membership] = await getDb()
      .select()
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.userId, userId!), eq(schoolMemberships.schoolId, admin.schoolId)));
    expect(membership.role).toBe("TEACHER");
    expect(membership.status).toBe("ACTIVE");

    const [profile] = await getDb().select().from(teacherProfiles).where(eq(teacherProfiles.membershipId, membership.id));
    expect(profile.id).toBe(result.teacherId);
    expect(profile.firstName).toBe("زهرا");
    expect(profile.personnelCode).toBe("T-101");
    expect(profile.schoolId).toBe(admin.schoolId);

    const [invitation] = await getDb().select().from(teacherInvitations).where(eq(teacherInvitations.membershipId, membership.id));
    expect(invitation.status).toBe("PENDING");
    expect(invitation.schoolId).toBe(admin.schoolId);
    expect(invitation.createdByUserId).toBe(admin.userId);

    expect(result.existingAccount).toBe(false);
    expect(result.reactivated).toBe(false);
    expect(result.invitation.token).toBeTruthy();
    expect(result.invitation.url).toContain(result.invitation.token);
  });

  it("creates no credential account, so the teacher cannot authenticate yet", async () => {
    const userId = (await userIdFor("09121110001"))!;
    const credentials = await getDb()
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
    expect(credentials).toHaveLength(0);

    // The account exists and its phone is verified, yet both enabled sign-in
    // endpoints refuse it. This is the guarantee behind "cannot authenticate
    // until activation".
    const auth = getAuth();
    for (const path of ["/api/auth/sign-in/phone-number", "/api/auth/sign-in/email"]) {
      const response = await auth.handler(
        new Request(`${BASE_URL}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            path.endsWith("phone-number")
              ? { phoneNumber: "09121110001", password: "A-secure-password-123!" }
              : { email: "09121110001@mobile.zangyar.local", password: "A-secure-password-123!" },
          ),
        }),
      );
      expect(response.status).toBe(401);
    }
  });

  it("grants no platform privilege to a provisioned teacher", async () => {
    const userId = (await userIdFor("09121110001"))!;
    const rows = await getDb().select().from(platformAdmins).where(eq(platformAdmins.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it("stores only the token hash, and keeps the plaintext out of the audit trail", async () => {
    const result = await createTeacher({
      headers: admin.headers,
      input: { firstName: "حسن", lastName: "کریمی", mobile: "09121110002" },
    });
    const token = result.invitation.token;

    const [row] = await getDb().select().from(teacherInvitations).where(eq(teacherInvitations.id, result.invitation.id));
    expect(row.tokenHash).toHaveLength(64);
    expect(row.tokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);

    const audits = await getDb().select().from(auditLogs).where(eq(auditLogs.schoolId, admin.schoolId));
    expect(JSON.stringify(audits)).not.toContain(token);
  });

  it("normalizes a localized spelling to the canonical stored identity", async () => {
    await createTeacher({
      headers: admin.headers,
      input: { firstName: "مریم", lastName: "رضایی", mobile: "+98 912 111 0003" },
    });

    const stored = await getDb().select({ phoneNumber: users.phoneNumber }).from(users).where(eq(users.phoneNumber, "09121110003"));
    expect(stored).toHaveLength(1);
  });

  it("refuses a duplicate active teacher in the same school without creating a second membership", async () => {
    await expect(
      createTeacher({ headers: admin.headers, input: { firstName: "زهرا", lastName: "محمدی", mobile: "09121110001" } }),
    ).rejects.toThrow("A teacher with this mobile number already belongs to this school.");

    const userId = (await userIdFor("09121110001"))!;
    const memberships = await getDb()
      .select({ id: schoolMemberships.id })
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.schoolId, admin.schoolId)));
    expect(memberships).toHaveLength(1);
  });

  it("reuses one global identity across schools without touching the other tenant", async () => {
    const result = await createTeacher({
      headers: otherAdmin.headers,
      input: { firstName: "زهرا", lastName: "محمدی", mobile: "09121110001" },
    });

    expect(result.existingAccount).toBe(true);

    const userId = (await userIdFor("09121110001"))!;
    const memberships = await getDb()
      .select({ schoolId: schoolMemberships.schoolId, role: schoolMemberships.role })
      .from(schoolMemberships)
      .where(eq(schoolMemberships.userId, userId));

    expect(memberships).toHaveLength(2);
    expect(new Set(memberships.map((row) => row.schoolId))).toEqual(new Set([admin.schoolId, otherAdmin.schoolId]));
    for (const membership of memberships) expect(membership.role).toBe("TEACHER");

    // One identity, not two.
    const identities = await getDb().select({ id: users.id }).from(users).where(eq(users.phoneNumber, "09121110001"));
    expect(identities).toHaveLength(1);

    // The first school's profile was not rewritten by the second school's create.
    const [firstProfile] = await getDb()
      .select({ lastName: teacherProfiles.lastName })
      .from(teacherProfiles)
      .innerJoin(schoolMemberships, eq(schoolMemberships.id, teacherProfiles.membershipId))
      .where(and(eq(teacherProfiles.schoolId, admin.schoolId), eq(schoolMemberships.userId, userId)));
    expect(firstProfile.lastName).toBe("محمدی");
  });

  it("makes a second identity for the same mobile impossible", async () => {
    await expect(
      getDb().insert(users).values({
        id: crypto.randomUUID(),
        name: "Impostor",
        email: `impostor-${crypto.randomUUID()}@example.com`,
        phoneNumber: "09121110001",
      }),
    ).rejects.toThrow();
  });

  it("refuses to repurpose an existing School Admin membership", async () => {
    await createTeacher({ headers: admin.headers, input: { firstName: "کاظم", lastName: "یوسفی", mobile: "09121110999" } });

    const db = getDb();
    const userId = (await userIdFor("09121110999"))!;
    await db
      .update(schoolMemberships)
      .set({ role: "SCHOOL_ADMIN" })
      .where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.schoolId, admin.schoolId)));

    await expect(
      createTeacher({ headers: admin.headers, input: { firstName: "کاظم", lastName: "یوسفی", mobile: "09121110999" } }),
    ).rejects.toThrow("This mobile number belongs to an account with a different role at this school.");
  });

  it("restores a suspended membership instead of inserting a duplicate", async () => {
    const created = await createTeacher({
      headers: admin.headers,
      input: { firstName: "سارا", lastName: "احمدی", mobile: "09121110004" },
    });

    const db = getDb();
    const userId = (await userIdFor("09121110004"))!;
    const [membership] = await db
      .select({ id: schoolMemberships.id })
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.schoolId, admin.schoolId)));

    await setTeacherMembershipStatus({ headers: admin.headers, input: { teacherId: created.teacherId, status: "SUSPENDED" } });

    const again = await createTeacher({
      headers: admin.headers,
      input: { firstName: "سارا", lastName: "احمدی", mobile: "09121110004" },
    });

    expect(again.reactivated).toBe(true);
    expect(again.membershipId).toBe(membership.id);

    const [restored] = await db.select().from(schoolMemberships).where(eq(schoolMemberships.id, membership.id));
    expect(restored.status).toBe("ACTIVE");
    expect(restored.suspendedAt).toBeNull();
    expect(restored.revokedAt).toBeNull();

    const all = await db
      .select({ id: schoolMemberships.id })
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.schoolId, admin.schoolId)));
    expect(all).toHaveLength(1);
  });

  it("cannot insert a teacher profile whose school disagrees with its membership", async () => {
    const [membership] = await getDb()
      .select({ id: schoolMemberships.id })
      .from(schoolMemberships)
      .where(eq(schoolMemberships.schoolId, admin.schoolId))
      .limit(1);

    // Both ids exist and are individually valid; the composite foreign key is
    // what makes the cross-tenant pairing impossible.
    await expect(
      getDb().insert(teacherProfiles).values({
        schoolId: otherAdmin.schoolId,
        membershipId: membership.id,
        firstName: "Cross",
        lastName: "Tenant",
      }),
    ).rejects.toThrow();
  });

  it("enforces one personnel code per school but allows the same code in another school", async () => {
    await expect(
      createTeacher({ headers: admin.headers, input: { firstName: "علی", lastName: "نوری", mobile: "09121110005", personnelCode: "T-101" } }),
    ).rejects.toThrow("Personnel code is already in use at this school.");

    // The conflict rolled the whole create back: no identity, membership, or
    // profile was left behind holding that mobile number.
    expect(await userIdFor("09121110005")).toBeNull();

    await expect(
      createTeacher({ headers: otherAdmin.headers, input: { firstName: "علی", lastName: "نوری", mobile: "09121110006", personnelCode: "T-101" } }),
    ).resolves.toBeTruthy();
  });
  it("updates the teacher profile and the account name together", async () => {
    const db = getDb();
    const userId = (await userIdFor("09121110001"))!;
    const [profile] = await db
      .select({ id: teacherProfiles.id })
      .from(teacherProfiles)
      .innerJoin(schoolMemberships, eq(schoolMemberships.id, teacherProfiles.membershipId))
      .where(and(eq(teacherProfiles.schoolId, admin.schoolId), eq(schoolMemberships.userId, userId)));

    await updateTeacher({
      headers: admin.headers,
      input: { teacherId: profile.id, firstName: "زهرا", lastName: "محمدی‌نژاد", personnelCode: "T-900" },
    });

    const [updated] = await db.select().from(teacherProfiles).where(eq(teacherProfiles.id, profile.id));
    expect(updated.lastName).toBe("محمدی‌نژاد");
    expect(updated.personnelCode).toBe("T-900");

    const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    expect(user.name).toBe("زهرا محمدی‌نژاد");
  });

  it("lists only this school's teachers and searches by name and by mobile", async () => {
    const context = asContext(admin);

    const all = await listTeachersForContext(context, teacherListFilterSchema.parse({ pageSize: 100 }));
    const schoolUserIds = new Set(
      (await getDb().select({ userId: schoolMemberships.userId }).from(schoolMemberships).where(eq(schoolMemberships.schoolId, admin.schoolId)))
        .map((row) => row.userId),
    );
    expect(all.rows.length).toBeGreaterThan(0);
    for (const row of all.rows) expect(schoolUserIds.has(row.userId)).toBe(true);

    const byName = await listTeachersForContext(context, teacherListFilterSchema.parse({ name: "رضایی", pageSize: 100 }));
    expect(byName.rows.map((row) => row.mobile)).toContain("09121110003");

    const byMobile = await listTeachersForContext(context, teacherListFilterSchema.parse({ mobile: "09121110002", pageSize: 100 }));
    expect(byMobile.rows).toHaveLength(1);
    expect(byMobile.rows[0].lastName).toBe("کریمی");

    const noMatch = await listTeachersForContext(context, teacherListFilterSchema.parse({ name: "ناموجود", pageSize: 100 }));
    expect(noMatch.rows).toHaveLength(0);
    expect(noMatch.total).toBe(0);
  });

  it("filters by membership status and by derived invitation status", async () => {
    const context = asContext(admin);

    const pending = await listTeachersForContext(context, teacherListFilterSchema.parse({ invitationStatus: "PENDING", pageSize: 100 }));
    expect(pending.rows.length).toBeGreaterThan(0);
    for (const row of pending.rows) expect(row.invitationStatus).toBe("PENDING");

    const suspended = await listTeachersForContext(context, teacherListFilterSchema.parse({ membershipStatus: "SUSPENDED", pageSize: 100 }));
    for (const row of suspended.rows) expect(row.membershipStatus).toBe("SUSPENDED");

    const activated = await listTeachersForContext(context, teacherListFilterSchema.parse({ invitationStatus: "CONSUMED", pageSize: 100 }));
    expect(activated.rows).toHaveLength(0);
  });

  it("hides another tenant's teacher from the detail query", async () => {
    const [foreignProfile] = await getDb()
      .select({ id: teacherProfiles.id })
      .from(teacherProfiles)
      .where(eq(teacherProfiles.schoolId, otherAdmin.schoolId))
      .limit(1);

    expect(await getTeacherForContext(asContext(admin), foreignProfile.id)).toBeNull();
  });

  it("does not resolve a teacher across tenants for its own admin either without the right school", async () => {
    const [ownProfile] = await getDb()
      .select({ id: teacherProfiles.id })
      .from(teacherProfiles)
      .where(eq(teacherProfiles.schoolId, admin.schoolId))
      .limit(1);

    // The query is anchored on the verified school, so the other school's admin
    // gets nothing even with a valid profile id.
    expect(await getTeacherForContext(asContext(otherAdmin), ownProfile.id)).toBeNull();
  });
});
