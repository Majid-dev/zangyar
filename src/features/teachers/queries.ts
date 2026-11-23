import "server-only";

import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import type { ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { accounts, schoolMemberships, schools, teacherInvitations, teacherProfiles, users } from "@/lib/db/schema";
import { toAsciiDigits } from "@/lib/digits";
import { maskIranianMobile } from "@/lib/mobile";

import { requireTeacherManagementAccess } from "./policy";
import { teacherListFilterSchema, type TeacherListFilter } from "./schema";
import { hashInvitationToken } from "./tokens";
import {
  deriveTeacherAccountStatus,
  effectiveInvitationStatus,
  type EffectiveInvitationStatus,
  type MembershipStatus,
  type TeacherAccountStatus,
} from "./status";

export type TeacherListRow = {
  teacherId: string;
  membershipId: string;
  userId: string;
  firstName: string;
  lastName: string;
  mobile: string | null;
  personnelCode: string | null;
  membershipStatus: MembershipStatus;
  invitationStatus: EffectiveInvitationStatus;
  accountStatus: TeacherAccountStatus;
  invitationExpiresAt: Date | null;
  activatedAt: Date | null;
};

export type TeacherListResult = {
  rows: TeacherListRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type TeacherDetail = TeacherListRow & {
  /** Masked for display; the full number is only ever the row's own identity. */
  maskedMobile: string | null;
  createdAt: Date;
};

export type TeacherInvitationRow = {
  id: string;
  status: EffectiveInvitationStatus;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
};

/**
 * The most recent invitation per membership.
 *
 * `selectDistinctOn` with a matching leading `orderBy` is the same idiom the
 * student list uses for its effective enrollment: it keeps one row per key
 * without a correlated subquery.
 */
function latestInvitationPerMembership(schoolId: string) {
  return getDb()
    .selectDistinctOn([teacherInvitations.membershipId], {
      membershipId: teacherInvitations.membershipId,
      id: teacherInvitations.id,
      status: teacherInvitations.status,
      expiresAt: teacherInvitations.expiresAt,
      consumedAt: teacherInvitations.consumedAt,
    })
    .from(teacherInvitations)
    .where(eq(teacherInvitations.schoolId, schoolId))
    .orderBy(asc(teacherInvitations.membershipId), desc(teacherInvitations.createdAt))
    .as("latest_invitation");
}

/** The credential account, present only after the teacher completed activation. */
function credentialAccount() {
  return getDb()
    .select({ userId: accounts.userId, createdAt: accounts.createdAt })
    .from(accounts)
    .where(eq(accounts.providerId, "credential"))
    .as("credential_account");
}

function orderFor(sort: TeacherListFilter["sort"], dir: TeacherListFilter["dir"], profile: typeof teacherProfiles) {
  const direction = dir === "desc" ? desc : asc;
  switch (sort) {
    case "mobile":
      return [direction(users.phoneNumber), asc(profile.lastName)];
    case "status":
      return [direction(schoolMemberships.status), asc(profile.lastName)];
    // Both remaining sorts are name-based; the invitation axis is filtered rather
    // than ordered because it is derived from a joined row.
    default:
      return [direction(profile.lastName), direction(profile.firstName)];
  }
}

export async function listTeachers(options: { headers: Headers; filters?: Partial<TeacherListFilter> }) {
  const context = await requireTeacherManagementAccess(options.headers);
  return listTeachersForContext(context, teacherListFilterSchema.parse(options.filters ?? {}));
}

export async function listTeachersForContext(
  context: ActiveSchoolMembership,
  filters: TeacherListFilter,
): Promise<TeacherListResult> {
  const db = getDb();
  const latestInvitation = latestInvitationPerMembership(context.schoolId);
  const credential = credentialAccount();
  const now = new Date();

  const namePattern = filters.name ? `%${filters.name}%` : undefined;
  // A pasted number may carry Persian digits or separators; normalize to the
  // stored canonical spelling before matching.
  const mobilePattern = filters.mobile ? `%${toAsciiDigits(filters.mobile).replace(/[\s\-()]/g, "")}%` : undefined;

  const invitationStatus = filters.invitationStatus;
  const invitationCondition: SQL | undefined = invitationStatus
    ? invitationStatus === "NONE"
      ? sql`${latestInvitation.id} is null`
      : invitationStatus === "EXPIRED"
        ? sql`${latestInvitation.status} = 'PENDING' and ${latestInvitation.expiresAt} <= ${now}`
        : invitationStatus === "PENDING"
          ? sql`${latestInvitation.status} = 'PENDING' and ${latestInvitation.expiresAt} > ${now}`
          : sql`${latestInvitation.status} = ${invitationStatus}`
    : undefined;

  const conditions = and(
    eq(schoolMemberships.schoolId, context.schoolId),
    eq(schoolMemberships.role, "TEACHER"),
    filters.membershipStatus ? eq(schoolMemberships.status, filters.membershipStatus) : undefined,
    namePattern
      ? or(
          ilike(users.name, namePattern),
          ilike(teacherProfiles.firstName, namePattern),
          ilike(teacherProfiles.lastName, namePattern),
        )
      : undefined,
    mobilePattern ? ilike(users.phoneNumber, mobilePattern) : undefined,
    invitationCondition,
  );

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        teacherId: teacherProfiles.id,
        membershipId: schoolMemberships.id,
        userId: schoolMemberships.userId,
        firstName: teacherProfiles.firstName,
        lastName: teacherProfiles.lastName,
        mobile: users.phoneNumber,
        personnelCode: teacherProfiles.personnelCode,
        membershipStatus: schoolMemberships.status,
        invitationStatus: latestInvitation.status,
        invitationExpiresAt: latestInvitation.expiresAt,
        activatedAt: credential.createdAt,
        createdAt: teacherProfiles.createdAt,
      })
      .from(schoolMemberships)
      .innerJoin(teacherProfiles, eq(teacherProfiles.membershipId, schoolMemberships.id))
      .innerJoin(users, eq(users.id, schoolMemberships.userId))
      .leftJoin(latestInvitation, eq(latestInvitation.membershipId, schoolMemberships.id))
      .leftJoin(credential, eq(credential.userId, schoolMemberships.userId))
      .where(conditions)
      .orderBy(...orderFor(filters.sort, filters.dir, teacherProfiles), asc(schoolMemberships.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db
      .select({ value: count() })
      .from(schoolMemberships)
      .innerJoin(teacherProfiles, eq(teacherProfiles.membershipId, schoolMemberships.id))
      .innerJoin(users, eq(users.id, schoolMemberships.userId))
      .leftJoin(latestInvitation, eq(latestInvitation.membershipId, schoolMemberships.id))
      .where(conditions),
  ]);

  return {
    rows: rows.map((row) => ({
      ...row,
      invitationStatus: effectiveInvitationStatus(
        row.invitationStatus ? { status: row.invitationStatus, expiresAt: row.invitationExpiresAt! } : null,
        now,
      ),
      accountStatus: deriveTeacherAccountStatus(
        row.membershipStatus,
        row.invitationStatus ? { status: row.invitationStatus, expiresAt: row.invitationExpiresAt! } : null,
        now,
      ),
    })),
    total: totalRow?.value ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export async function getTeacherForContext(
  context: ActiveSchoolMembership,
  teacherId: string,
): Promise<TeacherDetail | null> {
  const db = getDb();
  const latestInvitation = latestInvitationPerMembership(context.schoolId);
  const credential = credentialAccount();
  const now = new Date();

  const [row] = await db
    .select({
      teacherId: teacherProfiles.id,
      membershipId: schoolMemberships.id,
      userId: schoolMemberships.userId,
      firstName: teacherProfiles.firstName,
      lastName: teacherProfiles.lastName,
      mobile: users.phoneNumber,
      personnelCode: teacherProfiles.personnelCode,
      membershipStatus: schoolMemberships.status,
      invitationStatus: latestInvitation.status,
      invitationExpiresAt: latestInvitation.expiresAt,
      activatedAt: credential.createdAt,
      createdAt: teacherProfiles.createdAt,
    })
    .from(schoolMemberships)
    .innerJoin(teacherProfiles, eq(teacherProfiles.membershipId, schoolMemberships.id))
    .innerJoin(users, eq(users.id, schoolMemberships.userId))
    .leftJoin(latestInvitation, eq(latestInvitation.membershipId, schoolMemberships.id))
    .leftJoin(credential, eq(credential.userId, schoolMemberships.userId))
    .where(and(
      eq(teacherProfiles.id, teacherId),
      eq(schoolMemberships.schoolId, context.schoolId),
      eq(schoolMemberships.role, "TEACHER"),
    ))
    .limit(1);

  if (!row) return null;

  const invitation = row.invitationStatus
    ? { status: row.invitationStatus, expiresAt: row.invitationExpiresAt! }
    : null;

  return {
    ...row,
    maskedMobile: maskIranianMobile(row.mobile),
    invitationStatus: effectiveInvitationStatus(invitation, now),
    accountStatus: deriveTeacherAccountStatus(row.membershipStatus, invitation, now),
  };
}

export async function getTeacherForContextOrThrow(context: ActiveSchoolMembership, teacherId: string) {
  const teacher = await getTeacherForContext(context, teacherId);
  if (!teacher) throw new Error("Teacher not found.");
  return teacher;
}

export async function listTeacherInvitationsForContext(
  context: ActiveSchoolMembership,
  teacherId: string,
): Promise<TeacherInvitationRow[]> {
  const db = getDb();
  const now = new Date();

  const rows = await db
    .select({
      id: teacherInvitations.id,
      status: teacherInvitations.status,
      createdAt: teacherInvitations.createdAt,
      expiresAt: teacherInvitations.expiresAt,
      consumedAt: teacherInvitations.consumedAt,
      revokedAt: teacherInvitations.revokedAt,
    })
    .from(teacherInvitations)
    .innerJoin(teacherProfiles, eq(teacherProfiles.membershipId, teacherInvitations.membershipId))
    .where(and(
      eq(teacherProfiles.id, teacherId),
      eq(teacherInvitations.schoolId, context.schoolId),
    ))
    .orderBy(desc(teacherInvitations.createdAt));

  return rows.map((row) => ({
    ...row,
    status: effectiveInvitationStatus({ status: row.status, expiresAt: row.expiresAt }, now),
  }));
}

/**
 * Activation-link preview for the public activation page.
 *
 * Returns display-only values: the teacher's name and the school they are
 * joining. It exposes nothing about other tenants, and a caller learns only
 * whether the link is still usable.
 */
export async function resolveActivationToken(token: string) {
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .select({
      status: teacherInvitations.status,
      expiresAt: teacherInvitations.expiresAt,
      firstName: teacherProfiles.firstName,
      lastName: teacherProfiles.lastName,
      membershipStatus: schoolMemberships.status,
      schoolName: schools.name,
    })
    .from(teacherInvitations)
    .innerJoin(schoolMemberships, eq(schoolMemberships.id, teacherInvitations.membershipId))
    .innerJoin(teacherProfiles, eq(teacherProfiles.membershipId, teacherInvitations.membershipId))
    .innerJoin(schools, eq(schools.id, teacherInvitations.schoolId))
    .where(and(
      eq(teacherInvitations.tokenHash, hashInvitationToken(token)),
      eq(schoolMemberships.schoolId, teacherInvitations.schoolId),
    ))
    .limit(1);

  if (!row) return null;

  const status = effectiveInvitationStatus({ status: row.status, expiresAt: row.expiresAt }, now);

  return {
    teacherName: `${row.firstName} ${row.lastName}`,
    // Only the school the invitation belongs to: the page must not reveal any
    // other tenant the person might also belong to.
    schoolName: row.schoolName,
    usable: status === "PENDING" && row.membershipStatus === "ACTIVE",
    status,
  };
}
