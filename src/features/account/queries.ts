import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { accounts, schoolMemberships, schools, teacherProfiles, users } from "@/lib/db/schema";

import { nameFieldsFor } from "./profile";

export type AccountSchool = { id: string; name: string };

export type AccountProfile = {
  userId: string;
  firstName: string;
  lastName: string;
  /** The login identity. Shown read-only; changing it is not a profile edit. */
  mobile: string | null;
  mobileVerified: boolean;
  role: ActiveSchoolMembership["role"];
  activeSchool: AccountSchool;
  /** Every school the user may enter. More than one is what makes switching useful. */
  schools: AccountSchool[];
};

/**
 * The active memberships a user may switch between.
 *
 * Ordered by creation so the first membership is a stable default when no
 * selection is stored, and scoped to the user — the list is never filtered or
 * widened by anything the client supplies.
 */
export async function listUserSchools(userId: string): Promise<AccountSchool[]> {
  return getDb()
    .select({ id: schools.id, name: schools.name })
    .from(schoolMemberships)
    .innerJoin(schools, eq(schoolMemberships.schoolId, schools.id))
    .where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.status, "ACTIVE")))
    .orderBy(asc(schoolMemberships.createdAt), asc(schoolMemberships.id));
}

/**
 * Profile data for the settings surface and the shell's profile menu.
 *
 * The name is read from the teacher's school-local profile when they have one,
 * because that is the copy an admin and the teacher both edit and it is the one
 * shown on the teacher list; otherwise the account's own stored pair is used, and
 * failing that the whole `name` as a single value — never a split of it.
 * `updateOwnProfile` writes the account pair and `name` together, so they agree.
 */
export async function getAccountProfileForContext(context: ActiveSchoolMembership): Promise<AccountProfile> {
  const [[account], [teacherProfile], memberships] = await Promise.all([
    getDb()
      .select({
        name: users.name,
        firstName: users.firstName,
        lastName: users.lastName,
        mobile: users.phoneNumber,
        mobileVerified: users.phoneNumberVerified,
      })
      .from(users)
      .where(eq(users.id, context.userId))
      .limit(1),
    context.role === "TEACHER"
      ? getDb()
        .select({ firstName: teacherProfiles.firstName, lastName: teacherProfiles.lastName })
        .from(teacherProfiles)
        .where(eq(teacherProfiles.membershipId, context.membershipId))
        .limit(1)
      : Promise.resolve([]),
    listUserSchools(context.userId),
  ]);

  const { firstName, lastName } = nameFieldsFor(
    teacherProfile ?? { firstName: account?.firstName ?? null, lastName: account?.lastName ?? null, name: account?.name },
  );

  return {
    userId: context.userId,
    firstName,
    lastName,
    mobile: account?.mobile ?? null,
    mobileVerified: account?.mobileVerified ?? false,
    role: context.role,
    activeSchool: { id: context.schoolId, name: context.school.name },
    // Includes the active school, so the switcher shows the current selection in
    // place rather than as a separate item that has to be reconciled.
    schools: memberships,
  };
}

/**
 * Reads the same profile from request headers.
 *
 * Clerk-free alternative for callers that do not already hold a membership
 * context — the settings page does, so it uses the `ForContext` variant.
 */
export async function getAccountProfile(options: { headers: Headers }) {
  const context = await requireSchoolAccess({ headers: options.headers });
  return getAccountProfileForContext(context);
}

/**
 * Whether the user's account has a password credential.
 *
 * A mobile-only account can exist without one in principle, so the settings page
 * asks rather than assuming, and the password form explains itself instead of
 * failing at submit time.
 */
export async function hasPasswordCredential(userId: string) {
  const [credential] = await getDb()
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);

  return Boolean(credential);
}
