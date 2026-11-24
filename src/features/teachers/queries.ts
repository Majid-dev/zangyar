import "server-only";

import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import type { ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { schoolMemberships, teacherProfiles, teacherRegistrations, users } from "@/lib/db/schema";
import { toAsciiDigits } from "@/lib/digits";

import { requireTeacherManagementAccess } from "./policy";
import { teacherListFilterSchema, type TeacherListFilter } from "./schema";
import {
  deriveTeacherDisplayStatus,
  teacherRejectionAction,
  teacherStatusAction,
  type MembershipStatus,
  type TeacherDisplayStatus,
  type TeacherStatusAction,
} from "./status";

/**
 * A teacher row is anchored on the registration — the authorized mobile number —
 * because that exists before any account does. The person's name and their
 * membership appear once they have registered.
 */
export type TeacherListRow = {
  registrationId: string;
  phoneNumber: string;
  personnelCode: string | null;
  registrationStatus: "PENDING" | "CLAIMED" | "REVOKED";
  membershipStatus: MembershipStatus | null;
  displayStatus: TeacherDisplayStatus;
  /**
   * The one status move available for this teacher, or null before they register.
   * Derived server-side so the table and the detail page cannot disagree about
   * what is allowed, and so the client never decides an authorization question.
   */
  statusAction: TeacherStatusAction | null;
  /** The rejection move, offered alongside approval while a decision is pending. */
  rejectionAction: TeacherStatusAction | null;
  firstName: string | null;
  lastName: string | null;
  /** Whether the authorized number may still be corrected. */
  canEditMobile: boolean;
  /**
   * Whether the registration may be deleted outright.
   *
   * Wider than `canEditMobile` on purpose: a number withdrawn under the old model
   * (a legacy `REVOKED` row) is still nobody's, so an admin can clear it away, but
   * it is no longer an invitation and so is not open to correction.
   */
  canDeleteRegistration: boolean;
  /** From `users.phoneNumberVerified`; null before the person registers. */
  mobileVerified: boolean | null;
  registeredAt: Date | null;
};

export type TeacherListResult = {
  rows: TeacherListRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type TeacherDetail = TeacherListRow & {
  createdAt: Date;
};

/** The columns every teacher read selects, so list and detail cannot drift apart. */
const teacherSelection = {
  registrationId: teacherRegistrations.id,
  phoneNumber: teacherRegistrations.phoneNumber,
  // From the profile, not the registration: the personnel code is the teacher's own
  // employment detail, so it exists only once they have registered (ADR-028).
  personnelCode: teacherProfiles.personnelCode,
  registrationStatus: teacherRegistrations.status,
  membershipStatus: schoolMemberships.status,
  firstName: teacherProfiles.firstName,
  lastName: teacherProfiles.lastName,
  mobileVerified: users.phoneNumberVerified,
  registeredAt: teacherRegistrations.claimedAt,
  createdAt: teacherRegistrations.createdAt,
};

type TeacherSelectionRow = {
  registrationId: string;
  phoneNumber: string;
  personnelCode: string | null;
  registrationStatus: "PENDING" | "CLAIMED" | "REVOKED";
  membershipStatus: MembershipStatus | null;
  firstName: string | null;
  lastName: string | null;
  mobileVerified: boolean | null;
  registeredAt: Date | null;
};

function toRow(row: TeacherSelectionRow): TeacherListRow {
  return {
    registrationId: row.registrationId,
    phoneNumber: row.phoneNumber,
    personnelCode: row.personnelCode,
    registrationStatus: row.registrationStatus,
    membershipStatus: row.membershipStatus,
    firstName: row.firstName,
    lastName: row.lastName,
    mobileVerified: row.mobileVerified,
    registeredAt: row.registeredAt,
    displayStatus: deriveTeacherDisplayStatus({
      registrationStatus: row.registrationStatus,
      membershipStatus: row.membershipStatus,
    }),
    statusAction: teacherStatusAction(row.membershipStatus),
    rejectionAction: teacherRejectionAction(row.membershipStatus),
    // The number is the login identity once claimed, so it is only the admin's to
    // correct while nobody owns it.
    canEditMobile: row.registrationStatus === "PENDING",
    canDeleteRegistration: row.registrationStatus !== "CLAIMED",
  };
}

/**
 * Translates a derived display status into the stored conditions that produce it.
 *
 * The status is computed rather than stored, so each filter value is expressed as
 * the membership/registration combination behind it instead of a column compare.
 */
function statusCondition(status: TeacherDisplayStatus) {
  switch (status) {
    case "PENDING_REGISTRATION":
      return sql`${teacherRegistrations.membershipId} is null and ${teacherRegistrations.status} = 'PENDING'`;
    case "PENDING_ADMIN_APPROVAL":
      return sql`${schoolMemberships.status} = 'PENDING_ADMIN_APPROVAL'`;
    case "ACTIVE":
      return sql`${schoolMemberships.status} = 'ACTIVE'`;
    case "REJECTED":
      return sql`${schoolMemberships.status} = 'REJECTED'`;
    case "DEACTIVATED":
      return sql`(${schoolMemberships.status} in ('SUSPENDED','REVOKED') or ${teacherRegistrations.status} = 'REVOKED')`;
    default:
      return sql`true`;
  }
}

function orderFor(sort: TeacherListFilter["sort"], dir: TeacherListFilter["dir"]) {
  const direction = dir === "desc" ? desc : asc;
  switch (sort) {
    case "mobile":
      return [direction(teacherRegistrations.phoneNumber)];
    case "status":
      return [direction(teacherRegistrations.status), asc(teacherRegistrations.phoneNumber)];
    case "verification":
      // An unregistered row has no verification state; it sorts last either way.
      return [direction(users.phoneNumberVerified), asc(teacherRegistrations.phoneNumber)];
    case "personnel":
      return [direction(teacherProfiles.personnelCode), asc(teacherRegistrations.phoneNumber)];
    // Names exist only after registration, so a name sort falls back to the number.
    default:
      return [direction(teacherProfiles.lastName), direction(teacherProfiles.firstName), asc(teacherRegistrations.phoneNumber)];
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

  const namePattern = filters.name ? `%${filters.name}%` : undefined;
  // A pasted number may carry Persian digits or separators; normalize to the stored
  // canonical spelling before matching.
  const mobilePattern = filters.mobile ? `%${toAsciiDigits(filters.mobile).replace(/[\s\-()]/g, "")}%` : undefined;
  const personnelPattern = filters.personnelCode ? `%${toAsciiDigits(filters.personnelCode)}%` : undefined;

  const conditions = and(
    eq(teacherRegistrations.schoolId, context.schoolId),
    namePattern
      ? or(ilike(teacherProfiles.firstName, namePattern), ilike(teacherProfiles.lastName, namePattern))
      : undefined,
    mobilePattern ? ilike(teacherRegistrations.phoneNumber, mobilePattern) : undefined,
    personnelPattern ? ilike(teacherProfiles.personnelCode, personnelPattern) : undefined,
    filters.status ? statusCondition(filters.status) : undefined,
  );

  const [rows, [totalRow]] = await Promise.all([
    db
      .select(teacherSelection)
      .from(teacherRegistrations)
      .leftJoin(schoolMemberships, eq(schoolMemberships.id, teacherRegistrations.membershipId))
      .leftJoin(teacherProfiles, eq(teacherProfiles.membershipId, schoolMemberships.id))
      .leftJoin(users, eq(users.id, schoolMemberships.userId))
      .where(conditions)
      .orderBy(...orderFor(filters.sort, filters.dir))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db
      .select({ value: count() })
      .from(teacherRegistrations)
      .leftJoin(schoolMemberships, eq(schoolMemberships.id, teacherRegistrations.membershipId))
      .leftJoin(teacherProfiles, eq(teacherProfiles.membershipId, schoolMemberships.id))
      .where(conditions),
  ]);

  return {
    rows: rows.map(toRow),
    total: totalRow?.value ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

/** Loads one registration, anchored on the verified school. */
export async function getTeacherForContext(
  context: ActiveSchoolMembership,
  registrationId: string,
): Promise<TeacherDetail | null> {
  const [row] = await getDb()
    .select(teacherSelection)
    .from(teacherRegistrations)
    .leftJoin(schoolMemberships, eq(schoolMemberships.id, teacherRegistrations.membershipId))
    .leftJoin(teacherProfiles, eq(teacherProfiles.membershipId, schoolMemberships.id))
    .leftJoin(users, eq(users.id, schoolMemberships.userId))
    .where(and(
      eq(teacherRegistrations.id, registrationId),
      eq(teacherRegistrations.schoolId, context.schoolId),
    ))
    .limit(1);

  if (!row) return null;

  return { ...toRow(row), createdAt: row.createdAt };
}
