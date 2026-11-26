import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import type { ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { academicYears, schoolMemberships, teacherProfiles, teacherRegistrations, teacherWeeklyHourRequirements, users } from "@/lib/db/schema";
import { toAsciiDigits } from "@/lib/digits";

import { hourGateFor, hourGateVerdict, isSchedulable, type HourGateVerdict } from "./hours";

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
  /**
   * The teacher's mandatory weekly hours for the year this list is read against,
   * or null when none is recorded. Surfaced so the admin can see the figure the
   * eligibility rule is applied to, rather than only its consequence.
   */
  requiredWeeklyHours: number | null;
  /** Whether the figure read above is the active year's, so the label can name it. */
  academicYearName: string | null;
  /** What the mandatory-hours rule says about this teacher right now. */
  hourGate: HourGateVerdict;
  /** Whether they may be given timetable slots. The answer the gate exists for. */
  schedulable: boolean;
};

export type TeacherListResult = {
  rows: TeacherListRow[];
  total: number;
  page: number;
  pageSize: number;
  /**
   * The year hours are read and written against, or null when the school has no
   * active year. Passed to the UI so the approval dialog can say which year it is
   * recording hours for, and refusal is explained rather than silently failing.
   */
  activeAcademicYearId: string | null;
  activeAcademicYearName: string | null;
};

export type TeacherDetail = TeacherListRow & {
  createdAt: Date;
};

/** The columns every teacher read selects, so list and detail cannot drift apart. */
const teacherSelection = {
  registrationId: teacherRegistrations.id,
  phoneNumber: teacherRegistrations.phoneNumber,
  // Carried so a row can be matched to its recorded hours without a second query
  // per teacher.
  membershipId: schoolMemberships.id,
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
  membershipId: string | null;
  personnelCode: string | null;
  registrationStatus: "PENDING" | "CLAIMED" | "REVOKED";
  membershipStatus: MembershipStatus | null;
  firstName: string | null;
  lastName: string | null;
  mobileVerified: boolean | null;
  registeredAt: Date | null;
};

type ToRowOptions = {
  /** The year the hours column was read from; null when the school has none. */
  activeAcademicYearId: string | null;
  activeAcademicYearName: string | null;
  membershipId: string | null;
  hoursByMembership: ReadonlyMap<string, number>;
};

function toRow(row: TeacherSelectionRow, options: ToRowOptions): TeacherListRow {
  // Hours belong to the membership — there is no obligation without a teacher to
  // owe it — so an unregistered row has none to report, which is correct: nobody
  // has been approved and so nobody has been given a figure.
  const requiredWeeklyHours = options.membershipId ? options.hoursByMembership.get(options.membershipId) ?? null : null;
  const gate = hourGateFor(options.activeAcademicYearId, requiredWeeklyHours);
  const hourGate = hourGateVerdict(gate);
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
    requiredWeeklyHours,
    academicYearName: options.activeAcademicYearName,
    hourGate,
    // The gate is only meaningful while there is a year to schedule into: with no
    // active year nothing is being withheld, so no teacher is reported as blocked.
    schedulable: gate.applicable ? isSchedulable(requiredWeeklyHours) : false,
    displayStatus: deriveTeacherDisplayStatus({
      registrationStatus: row.registrationStatus,
      membershipStatus: row.membershipStatus,
      hoursOutstanding: hourGate === "OUTSTANDING",
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
/**
 * Whether the membership has a usable obligation recorded for the given year.
 *
 * Expressed against the requirements table directly rather than through the
 * per-row map, because a status filter runs in SQL and cannot consult a value the
 * application computed after the fact. `academicYearId` null means the school has
 * no active year, in which case no obligation can exist and the predicate is
 * false — which is why ACTIVE and AWAITING_HOURS are the only statuses that need
 * the year at all.
 */
function hasHoursCondition(academicYearId: string | null) {
  if (academicYearId === null) return sql`false`;
  return sql`exists (
    select 1 from ${teacherWeeklyHourRequirements}
    where ${teacherWeeklyHourRequirements.schoolId} = ${schoolMemberships.schoolId}
      and ${teacherWeeklyHourRequirements.teacherMembershipId} = ${schoolMemberships.id}
      and ${teacherWeeklyHourRequirements.academicYearId} = ${academicYearId}
      and ${teacherWeeklyHourRequirements.requiredWeeklyHours} > 0
  )`;
}

function statusCondition(status: TeacherDisplayStatus, academicYearId: string | null) {
  switch (status) {
    case "PENDING_REGISTRATION":
      return sql`${teacherRegistrations.membershipId} is null and ${teacherRegistrations.status} = 'PENDING'`;
    case "PENDING_ADMIN_APPROVAL":
      return sql`${schoolMemberships.status} = 'PENDING_ADMIN_APPROVAL'`;
    case "ACTIVE":
      // Active is now two states to the admin: genuinely usable, and held back
      // only by a missing obligation. Each filter names exactly one of them.
      return sql`${schoolMemberships.status} = 'ACTIVE' and ${hasHoursCondition(academicYearId)}`;
    case "AWAITING_HOURS":
      return sql`${schoolMemberships.status} = 'ACTIVE' and not ${hasHoursCondition(academicYearId)}`;
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

/**
 * The year teacher hours are read and written against.
 *
 * The one `ACTIVE` academic year, enforced by a partial unique index, so this is a
 * single lookup rather than a choice. Hours are recorded against it because the
 * obligation is agreed for a year (see `hours.ts`); a school with no active year
 * has nowhere to record one, which is the condition the approval path reports.
 */
export async function getActiveAcademicYear(context: ActiveSchoolMembership) {
  const [year] = await getDb()
    .select({ id: academicYears.id, name: academicYears.name })
    .from(academicYears)
    .where(and(eq(academicYears.schoolId, context.schoolId), eq(academicYears.status, "ACTIVE")))
    .limit(1);
  return year ?? null;
}

/** Recorded weekly hours for the given memberships in one year, keyed by membership. */
async function hoursByMembership(schoolId: string, academicYearId: string | null, membershipIds: readonly string[]) {
  const map = new Map<string, number>();
  if (academicYearId === null || membershipIds.length === 0) return map;
  const rows = await getDb()
    .select({
      teacherMembershipId: teacherWeeklyHourRequirements.teacherMembershipId,
      requiredWeeklyHours: teacherWeeklyHourRequirements.requiredWeeklyHours,
    })
    .from(teacherWeeklyHourRequirements)
    .where(and(
      eq(teacherWeeklyHourRequirements.schoolId, schoolId),
      eq(teacherWeeklyHourRequirements.academicYearId, academicYearId),
      inArray(teacherWeeklyHourRequirements.teacherMembershipId, [...membershipIds]),
    ));
  for (const row of rows) map.set(row.teacherMembershipId, row.requiredWeeklyHours);
  return map;
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
  // Resolved before the query because the status filter needs it in SQL, and the
  // row projection needs it to decide each teacher's hour gate.
  const activeYear = await getActiveAcademicYear(context);

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
    filters.status ? statusCondition(filters.status, activeYear?.id ?? null) : undefined,
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

  const hours = await hoursByMembership(
    context.schoolId,
    activeYear?.id ?? null,
    rows.map((row) => row.membershipId).filter((value): value is string => value !== null),
  );
  const rowOptions = {
    activeAcademicYearId: activeYear?.id ?? null,
    activeAcademicYearName: activeYear?.name ?? null,
    hoursByMembership: hours,
  };

  return {
    rows: rows.map((row) => toRow(row, { ...rowOptions, membershipId: row.membershipId })),
    total: totalRow?.value ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
    activeAcademicYearId: activeYear?.id ?? null,
    activeAcademicYearName: activeYear?.name ?? null,
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

  const activeYear = await getActiveAcademicYear(context);
  const hours = await hoursByMembership(context.schoolId, activeYear?.id ?? null, row.membershipId ? [row.membershipId] : []);

  return {
    ...toRow(row, {
      activeAcademicYearId: activeYear?.id ?? null,
      activeAcademicYearName: activeYear?.name ?? null,
      membershipId: row.membershipId,
      hoursByMembership: hours,
    }),
    createdAt: row.createdAt,
  };
}
