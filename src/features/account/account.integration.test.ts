import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";

import { getAuth } from "@/lib/auth";
import { ACTIVE_SCHOOL_COOKIE } from "@/lib/auth/active-school";
import { requireSchoolAccess } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { accounts, auditLogs, schoolMemberships, schoolSettings, schools, sessions, teacherProfiles, users } from "@/lib/db/schema";
import { switchActiveSchool, updateOwnProfile } from "./services";

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

async function createUser(suffix: string) {
  const auth = getAuth();
  const email = `account-${suffix}-${crypto.randomUUID()}@example.com`;

  const signUp = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Account Test", email, password: PASSWORD }),
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

  return { userId: body.user.id, headers: new Headers({ cookie: cookieHeader(signIn) }) };
}

/**
 * A teacher with an active membership at two schools — the only shape for which
 * switching exists — plus the teacher profile each school owns.
 *
 * A real teacher's second membership starts as PENDING_ADMIN_APPROVAL; these are
 * set ACTIVE directly because approval is a separate flow with its own suite, and
 * what is under test here is which school a *permitted* user lands in.
 */
async function createTwoSchoolTeacher() {
  const teacher = await createUser("teacher");
  const db = getDb();

  const createdSchools = await db
    .insert(schools)
    .values([
      { slug: `account-a-${crypto.randomUUID()}`, name: "Account School A", status: "ACTIVE" },
      { slug: `account-b-${crypto.randomUUID()}`, name: "Account School B", status: "ACTIVE" },
    ])
    .returning({ id: schools.id, name: schools.name });

  const [schoolA, schoolB] = createdSchools;

  for (const school of createdSchools) {
    await db.insert(schoolSettings).values({ schoolId: school.id }).onConflictDoNothing();
  }

  const memberships = await db
    .insert(schoolMemberships)
    .values([
      { schoolId: schoolA.id, userId: teacher.userId, role: "TEACHER", status: "ACTIVE" },
      { schoolId: schoolB.id, userId: teacher.userId, role: "TEACHER", status: "ACTIVE" },
    ])
    .returning({ id: schoolMemberships.id, schoolId: schoolMemberships.schoolId });

  for (const membership of memberships) {
    await db.insert(teacherProfiles).values({
      schoolId: membership.schoolId,
      membershipId: membership.id,
      firstName: "سارا",
      lastName: "کاظمی",
    });
  }

  return { ...teacher, schoolA, schoolB, memberships };
}

describe.skipIf(!canRun)("account settings and school switching", () => {
  let teacher: Awaited<ReturnType<typeof createTwoSchoolTeacher>>;
  let other: Awaited<ReturnType<typeof createUser>>;

  beforeAll(async () => {
    teacher = await createTwoSchoolTeacher();
    other = await createUser("other");
  });

  afterAll(async () => {
    const db = getDb();
    const schoolIds = [teacher?.schoolA?.id, teacher?.schoolB?.id].filter((id): id is string => Boolean(id));

    // Audit rows are deleted first: they carry a composite foreign key to the
    // (school, membership) pair, so the memberships cannot be removed while an
    // event still references them.
    for (const actor of [teacher, other]) {
      if (!actor) continue;
      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, actor.userId));
    }

    for (const schoolId of schoolIds) {
      await db.delete(teacherProfiles).where(eq(teacherProfiles.schoolId, schoolId));
      await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolId));
      await db.delete(schoolSettings).where(eq(schoolSettings.schoolId, schoolId));
      await db.delete(schools).where(eq(schools.id, schoolId));
    }

    for (const actor of [teacher, other]) {
      if (!actor) continue;
      await db.delete(sessions).where(eq(sessions.userId, actor.userId));
      await db.delete(accounts).where(eq(accounts.userId, actor.userId));
      await db.delete(users).where(eq(users.id, actor.userId));
    }
  });

  it("opens the first membership when nothing has been selected, and keeps doing so", async () => {
    const first = await requireSchoolAccess({ headers: teacher.headers });
    const second = await requireSchoolAccess({ headers: teacher.headers });

    expect(first.schoolId).toBe(teacher.schoolA.id);
    // Deterministic across requests: an unselected user never drifts between schools.
    expect(second.schoolId).toBe(first.schoolId);
  });

  it("switches the active school to another membership of the same user", async () => {
    const switched = await switchActiveSchool({
      headers: teacher.headers,
      input: { schoolId: teacher.schoolB.id },
    });
    expect(switched.schoolId).toBe(teacher.schoolB.id);

    // The action persists the choice in a cookie; a later request presents it, and
    // the resolver must open that school rather than the deterministic default.
    const withPreference = new Headers(teacher.headers);
    withPreference.set("cookie", `${teacher.headers.get("cookie")}; ${ACTIVE_SCHOOL_COOKIE}=${teacher.schoolB.id}`);

    const resolved = await requireSchoolAccess({ headers: withPreference });
    expect(resolved.schoolId).toBe(teacher.schoolB.id);
    expect(resolved.membershipId).toBe(teacher.memberships.find((m) => m.schoolId === teacher.schoolB.id)?.id);
  });

  it("refuses to switch into a school the user has no active membership in", async () => {
    const [orphan] = await getDb()
      .insert(schools)
      .values({ slug: `account-orphan-${crypto.randomUUID()}`, name: "Account Orphan School", status: "ACTIVE" })
      .returning({ id: schools.id });

    try {
      await expect(
        switchActiveSchool({ headers: teacher.headers, input: { schoolId: orphan.id } }),
      ).rejects.toMatchObject({ code: "SCHOOL_ACCESS_DENIED" });
    } finally {
      await getDb().delete(schools).where(eq(schools.id, orphan.id));
    }
  });

  it("refuses a switch forged for another user's school", async () => {
    await expect(
      switchActiveSchool({ headers: other.headers, input: { schoolId: teacher.schoolA.id } }),
    ).rejects.toMatchObject({ code: "SCHOOL_ACCESS_DENIED" });
  });

  it("ignores a stored preference that names a school the user cannot reach", async () => {
    // A stale or hand-edited cookie must not open another tenant: the preference
    // only ever selects among the user's own memberships.
    const forged = new Headers(other.headers);
    forged.set("cookie", `${other.headers.get("cookie")}; ${ACTIVE_SCHOOL_COOKIE}=${teacher.schoolA.id}`);

    await expect(requireSchoolAccess({ headers: forged })).rejects.toMatchObject({ code: "SCHOOL_ACCESS_DENIED" });
  });

  it("rejects an unauthenticated switch", async () => {
    await expect(
      switchActiveSchool({ headers: new Headers(), input: { schoolId: teacher.schoolA.id } }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("updates the account name and the active school's teacher profile together", async () => {
    const switched = new Headers(teacher.headers);
    switched.set("cookie", `${teacher.headers.get("cookie")}; ${ACTIVE_SCHOOL_COOKIE}=${teacher.schoolA.id}`);

    await updateOwnProfile({ headers: switched, input: { firstName: "نگار", lastName: "امینی" } });

    const [account] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, teacher.userId));
    expect(account?.name).toBe("نگار امینی");

    const profileA = await getDb()
      .select({ firstName: teacherProfiles.firstName, lastName: teacherProfiles.lastName })
      .from(teacherProfiles)
      .where(eq(teacherProfiles.schoolId, teacher.schoolA.id));
    expect(profileA[0]).toMatchObject({ firstName: "نگار", lastName: "امینی" });

    // The other school's record is that school's to change, so it is untouched.
    const profileB = await getDb()
      .select({ firstName: teacherProfiles.firstName })
      .from(teacherProfiles)
      .where(eq(teacherProfiles.schoolId, teacher.schoolB.id));
    expect(profileB[0]?.firstName).toBe("سارا");
  });

  it("writes an audit event for the profile change inside the active tenant", async () => {
    const events = await getDb()
      .select({ schoolId: auditLogs.schoolId, action: auditLogs.action })
      .from(auditLogs)
      .where(and(eq(auditLogs.actorUserId, teacher.userId), eq(auditLogs.action, "USER_PROFILE_UPDATED")));

    expect(events.length).toBeGreaterThan(0);
    // Recorded against the school the change was made in, never another tenant's.
    expect(events.every((event) => event.schoolId === teacher.schoolA.id)).toBe(true);
  });

  it("rejects a profile update for an unauthenticated request", async () => {
    await expect(
      updateOwnProfile({ headers: new Headers(), input: { firstName: "بدون", lastName: "نشست" } }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects a profile update with an empty name", async () => {
    await expect(
      updateOwnProfile({ headers: teacher.headers, input: { firstName: "   ", lastName: "امینی" } }),
    ).rejects.toThrow();
  });
});
