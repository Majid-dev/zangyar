import {
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
};

export const schoolStatus = pgEnum("school_status", ["ACTIVE", "SUSPENDED", "ARCHIVED"]);
export const membershipRole = pgEnum("membership_role", ["SCHOOL_ADMIN", "TEACHER"]);
// A teacher's access is granted only once a School Admin approves them, so the
// approval decision lives on the membership. Every authorization path already
// filters `status = 'ACTIVE'`, which means a pending or rejected teacher is
// denied automatically with no change to any check. `PENDING_ADMIN_APPROVAL` and
// `REJECTED` were added by a later migration.
export const membershipStatus = pgEnum("membership_status", ["ACTIVE", "SUSPENDED", "REVOKED", "PENDING_ADMIN_APPROVAL", "REJECTED"]);
export const academicYearStatus = pgEnum("academic_year_status", ["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]);
export const teacherRegistrationStatus = pgEnum("teacher_registration_status", ["PENDING", "CLAIMED", "REVOKED"]);
// `TEACHER_REGISTRATION` replaced `TEACHER_ACTIVATION` when invitations were
// removed. The legacy value remains in the database type but is no longer
// accepted by the application.
export const otpPurpose = pgEnum("otp_purpose", ["TEACHER_ACTIVATION", "TEACHER_REGISTRATION", "LOGIN", "PASSWORD_RESET"]);
export const otpChallengeStatus = pgEnum("otp_challenge_status", ["PENDING", "CONSUMED", "REVOKED", "EXHAUSTED"]);
export const recordStatus = pgEnum("record_status", ["ACTIVE", "ARCHIVED"]);
export const studentStatus = pgEnum("student_status", ["ACTIVE", "WITHDRAWN", "GRADUATED", "ARCHIVED"]);
// The school's schedule shape: a fixed morning or afternoon shift, or the two
// alternating by week. Stored rather than derived so a rotating school is
// expressible as data, and so the rotation anchor has something to be conditional
// on — see `school_settings`.
export const schoolShiftKind = pgEnum("school_shift_kind", ["MORNING", "AFTERNOON", "ROTATING"]);
// The shift a session actually ran in. A rotating school alternates between the
// two week by week, so this cannot be read off the configuration row alone; it is
// recorded on the session so a past register keeps its own answer.
export const applicableShift = pgEnum("applicable_shift", ["MORNING", "AFTERNOON"]);
export const attendanceSessionStatus = pgEnum("attendance_session_status", ["OPEN", "CLOSED"]);
export const attendanceStatus = pgEnum("attendance_status", ["PRESENT", "ABSENT", "LATE", "EXCUSED"]);
export const notificationEventType = pgEnum("notification_event_type", ["ATTENDANCE", "ACTIVITY"]);
export const notificationStatus = pgEnum("notification_status", ["PENDING", "PROCESSING", "SENT", "FAILED", "CANCELLED"]);
export const notificationAttemptStatus = pgEnum("notification_attempt_status", ["SENT", "FAILED", "RETRYABLE", "PERMANENT"]);

// Better Auth owns these global identity/session tables. Business entities reference user.id.
// `phoneNumber` is the login identity (canonical `09XXXXXXXXX`, see lib/mobile.ts);
// `email` remains a required unique column because Better Auth identity rows and
// the development bootstrap still provision one.
//
// `firstName` / `lastName` are the account's own name pair, alongside the single
// `name` Better Auth requires. Nullable, because `name` remains the only field
// every existing account is guaranteed to have: a row with a null pair is a
// legacy account whose pair is not yet known, and the account surface must not
// invent one by splitting `name` on every read. Both are written together by
// `updateOwnProfile`, so they are either both set or both null.
export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  phoneNumber: varchar("phone_number", { length: 20 }).unique(),
  phoneNumberVerified: boolean("phone_number_verified").default(false).notNull(),
  ...timestamps,
});

export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ...timestamps,
}, (table) => [
  index("session_user_id_idx").on(table.userId),
  index("session_expires_at_idx").on(table.expiresAt),
]);

export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true, mode: "date" }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
}, (table) => [
  unique("account_provider_account_unique").on(table.providerId, table.accountId),
  index("account_user_id_idx").on(table.userId),
]);

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  ...timestamps,
}, (table) => [
  index("verification_identifier_idx").on(table.identifier),
  index("verification_expires_at_idx").on(table.expiresAt),
]);

export const schools = pgTable("schools", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  status: schoolStatus("status").default("ACTIVE").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("Asia/Tehran").notNull(),
  phone: varchar("phone", { length: 32 }),
  address: text("address"),
  ...timestamps,
});

export const platformAdmins = pgTable("platform_admins", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "restrict" }),
  grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
});

export const schoolMemberships = pgTable("school_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  role: membershipRole("role").notNull(),
  status: membershipStatus("status").default("ACTIVE").notNull(),
  suspendedAt: timestamp("suspended_at", { withTimezone: true, mode: "date" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  ...timestamps,
}, (table) => [
  unique("school_memberships_school_id_unique").on(table.schoolId, table.id),
  unique("school_memberships_school_user_unique").on(table.schoolId, table.userId),
  index("school_memberships_school_role_status_idx").on(table.schoolId, table.role, table.status),
  index("school_memberships_user_status_idx").on(table.userId, table.status),
]);

/**
 * One school's timetable configuration.
 *
 * Shift, rotation anchor, and operating weekdays live on the school's single
 * settings row rather than in a separate shift table. That follows from the
 * periods: every period is "a period" now — there is no lesson-versus-break
 * column — so a school has exactly one period list, and a single period list can
 * belong to exactly one shift. A table of shifts would therefore have held either
 * one row or a set of rows sharing one period list, which is a column pretending
 * to be a relation.
 *
 * `shiftType` is the school's schedule shape: a fixed morning or afternoon shift,
 * or the two alternating by week. Rotation is anchored to a stored date
 * (`rotationBaseDate`) so "which shift is in session this week" is reproducible
 * from the row instead of depending on when it was written. The week containing
 * the base date is the morning week, and each following week alternates.
 */
export const schoolSettings = pgTable("school_settings", {
  schoolId: uuid("school_id").primaryKey().references(() => schools.id, { onDelete: "restrict" }),
  notifyOnPresent: boolean("notify_on_present").default(false).notNull(),
  notifyOnAbsent: boolean("notify_on_absent").default(false).notNull(),
  notifyOnLate: boolean("notify_on_late").default(false).notNull(),
  notifyOnExcused: boolean("notify_on_excused").default(false).notNull(),
  // How long after a period ends its attendance may still be submitted. Zero
  // means "until the period ends"; the value is a school-wide policy, not a
  // per-shift one, because the deadline is a reporting rule rather than a
  // property of the timetable.
  attendanceSubmissionMinutes: integer("attendance_submission_minutes").default(0).notNull(),
  shiftType: schoolShiftKind("shift_type").default("MORNING").notNull(),
  // Required exactly when the shift is rotating: the schedule has nowhere to
  // alternate from otherwise.
  rotationBaseDate: date("rotation_base_date", { mode: "string" }),
  ...timestamps,
}, (table) => [
  check("school_settings_attendance_submission_minutes_check", sql`${table.attendanceSubmissionMinutes} >= 0`),
  check("school_settings_rotation_base_date_check", sql`(
    (${table.shiftType} = 'ROTATING' and ${table.rotationBaseDate} is not null)
    or (${table.shiftType} <> 'ROTATING' and ${table.rotationBaseDate} is null)
  )`),
]);

/**
 * One period in the school's day.
 *
 * Periods are a single ordered list for the whole school, so there is no kind and
 * no label: a period is identified by its position and described by when it
 * starts and ends. Breaks are not modelled at all — a gap between one period's
 * end and the next one's start is simply a gap, which is why the table has no
 * break row and no interval column.
 *
 * `startTime`/`endTime` are the period's times in the shift the school opens in,
 * which is what a fixed school has and all it needs. A rotating school runs two
 * shifts, so it also carries `afternoonStartTime`/`afternoonEndTime` for the
 * weeks it is in the afternoon; those are null for a fixed school, and which pair
 * applies on a date is resolved from the shift that date falls in (see
 * `resolveApplicableShift` and `resolvePeriodTimes`). Keeping the opening shift in
 * the original two columns means a school that never rotates — and every existing
 * row — needs nothing more.
 *
 * A period is naturally two hours, and it is the *assignments* inside it that
 * decide what those hours are: a period whose two hour rows name the same teacher
 * and subject is a two-hour lesson, and one whose rows differ is a period split
 * between two lessons. Keeping that on the assignments rather than here is what
 * lets one period hold either shape without the period having to be declared as
 * one thing or the other.
 */
export const schoolPeriods = pgTable("school_periods", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  ordinal: integer("ordinal").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  // The same period's times in the afternoon shift, present exactly when the
  // school rotates. Both are set or both are null, which the check below enforces.
  afternoonStartTime: time("afternoon_start_time"),
  afternoonEndTime: time("afternoon_end_time"),
  ...timestamps,
}, (table) => [
  unique("school_periods_school_ordinal_unique").on(table.schoolId, table.ordinal),
  unique("school_periods_school_id_id_unique").on(table.schoolId, table.id),
  check("school_periods_time_order_check", sql`${table.startTime} < ${table.endTime}`),
  check("school_periods_ordinal_check", sql`${table.ordinal} > 0`),
  // The afternoon pair is all-or-nothing and ordered, so a half-entered afternoon
  // schedule cannot exist to be read as a time that never happened.
  check("school_periods_afternoon_times_check", sql`(
    (${table.afternoonStartTime} is null and ${table.afternoonEndTime} is null)
    or (${table.afternoonStartTime} is not null and ${table.afternoonEndTime} is not null and ${table.afternoonStartTime} < ${table.afternoonEndTime})
  )`),
  index("school_periods_school_ordinal_idx").on(table.schoolId, table.ordinal),
]);

/**
 * The weekdays the school operates on.
 *
 * Stored as the presence of a row rather than as seven booleans or a bitmask:
 * "which days is the school open" is a set, and a set with its own rows can be
 * read, ordered, and constrained like every other relationship here. `dayOfWeek`
 * follows the school's own week and is numbered 1 (Saturday) through 7 (Friday),
 * which is why it is documented here instead of being left to the caller.
 */
export const schoolOperatingDays = pgTable("school_operating_days", {
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  dayOfWeek: integer("day_of_week").notNull(),
  ...timestamps,
}, (table) => [
  primaryKey({ columns: [table.schoolId, table.dayOfWeek] }),
  check("school_operating_days_day_of_week_check", sql`${table.dayOfWeek} between 1 and 7`),
]);

// A teacher's school-local employment record. The membership carries identity,
// role, and access; this row carries the attributes that only mean something for
// a teacher at one school, such as the personnel code. `schoolId` is stored
// explicitly and tied to the membership through a composite foreign key, so a
// profile can never describe a membership in another school.
export const teacherProfiles = pgTable("teacher_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  membershipId: uuid("membership_id").notNull(),
  personnelCode: varchar("personnel_code", { length: 50 }),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  ...timestamps,
}, (table) => [
  foreignKey({
    columns: [table.schoolId, table.membershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "teacher_profiles_school_membership_fk",
  }).onDelete("restrict"),
  unique("teacher_profiles_membership_unique").on(table.membershipId),
  uniqueIndex("teacher_profiles_school_personnel_code_unique").on(table.schoolId, table.personnelCode).where(sql`personnel_code is not null`),
  index("teacher_profiles_school_name_idx").on(table.schoolId, table.lastName, table.firstName),
]);

/**
 * A mobile number a School Admin has authorized to join the school.
 *
 * This is deliberately separate from both identity and membership, because a
 * membership requires a `userId` and no account exists until the person
 * registers. The admin's only assertion is "this number may join us"; the person
 * supplies their own name, personnel code, and password later, from the public
 * registration page.
 *
 * The row is durable rather than consumed: it is the record of who authorized
 * which number, it keeps an unclaimed number visible to the admin, and it carries
 * the resulting membership once registration completes. A number may be
 * authorized once per school; deleting an unclaimed row and re-adding is allowed.
 *
 * It carries no personnel code: that is a teacher-school attribute and belongs on
 * the profile the teacher's own registration creates (ADR-022, ADR-028).
 */
export const teacherRegistrations = pgTable("teacher_registrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  // Canonical `09XXXXXXXXX`, the same normalization the login identity uses.
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  status: teacherRegistrationStatus("status").default("PENDING").notNull(),
  // Set when the person completes registration; null while only authorized.
  membershipId: uuid("membership_id"),
  claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
}, (table) => [
  // One live authorization per number per school. A removed number frees the slot
  // so it can be re-authorized, which is why REVOKED is excluded rather than
  // treated as a plain uniqueness conflict.
  uniqueIndex("teacher_registrations_school_phone_unique").on(table.schoolId, table.phoneNumber).where(sql`status <> 'REVOKED'`),
  // Tolerates a null membership while only authorized, and once set guarantees the
  // membership belongs to this same school.
  foreignKey({
    columns: [table.schoolId, table.membershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "teacher_registrations_school_membership_fk",
  }).onDelete("restrict"),
  index("teacher_registrations_school_status_idx").on(table.schoolId, table.status),
  // Public registration looks a number up across all schools, so this is not
  // school-prefixed on purpose.
  index("teacher_registrations_phone_idx").on(table.phoneNumber),
]);

/**
 * One-time OTP challenges.
 *
 * Deliberately separate from Better Auth's `verification` table (which the
 * phone-number plugin owns and fills with plaintext `code:attempts` values):
 * that table has no purpose, no attempt ceiling, no resend cooldown, and no way
 * to associate a challenge with a school membership. A challenge here is keyed
 * by purpose as well as number, so a code issued for one purpose cannot satisfy
 * another.
 *
 * Only a keyed hash of the code is stored — never the code itself. A six-digit
 * code has 10^6 possible values, so a bare hash would be brute-forced offline in
 * milliseconds if a row leaked; the hash is HMAC-peppered with a server secret
 * for that reason.
 */
export const otpChallenges = pgTable("otp_challenges", {
  id: uuid("id").defaultRandom().primaryKey(),
  purpose: otpPurpose("purpose").notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  codeHash: char("code_hash", { length: 64 }).notNull(),
  status: otpChallengeStatus("status").default("PENDING").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  maxAttempts: integer("max_attempts").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  // Which provider delivered the code, for later attempt analysis. The provider's
  // own settings never reach the database.
  provider: varchar("provider", { length: 64 }).notNull(),
  // Present only for purposes tied to a tenant, such as teacher activation.
  schoolId: uuid("school_id"),
  membershipId: uuid("membership_id"),
  ...timestamps,
}, (table) => [
  // At most one live challenge per purpose and number. A new request revokes the
  // current pending row first, which is how "invalidate previously issued OTPs"
  // is enforced rather than merely documented.
  uniqueIndex("otp_challenges_one_pending_idx").on(table.purpose, table.phoneNumber).where(sql`status = 'PENDING'`),
  index("otp_challenges_purpose_phone_created_idx").on(table.purpose, table.phoneNumber, table.createdAt),
  index("otp_challenges_expires_idx").on(table.expiresAt),
  foreignKey({
    columns: [table.schoolId, table.membershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "otp_challenges_school_membership_fk",
  }).onDelete("restrict"),
  check("otp_challenges_attempts_check", sql`${table.attemptCount} >= 0 and ${table.attemptCount} <= ${table.maxAttempts}`),
]);

export const academicYears = pgTable("academic_years", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  status: academicYearStatus("status").default("DRAFT").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
  ...timestamps,
}, (table) => [
  unique("academic_years_school_code_unique").on(table.schoolId, table.code),
  unique("academic_years_school_id_id_unique").on(table.schoolId, table.id),
  uniqueIndex("academic_years_one_active_per_school_idx").on(table.schoolId).where(sql`status = 'ACTIVE'`),
  check("academic_years_date_order_check", sql`${table.startDate} < ${table.endDate}`),
  index("academic_years_school_status_idx").on(table.schoolId, table.status),
]);

export const grades = pgTable("grades", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  status: recordStatus("status").default("ACTIVE").notNull(),
  ...timestamps,
}, (table) => [
  unique("grades_school_code_unique").on(table.schoolId, table.code),
  unique("grades_school_id_id_unique").on(table.schoolId, table.id),
  index("grades_school_status_order_idx").on(table.schoolId, table.status, table.sortOrder),
]);

export const subjects = pgTable("subjects", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  status: recordStatus("status").default("ACTIVE").notNull(),
  ...timestamps,
}, (table) => [
  unique("subjects_school_code_unique").on(table.schoolId, table.code),
  unique("subjects_school_id_id_unique").on(table.schoolId, table.id),
  index("subjects_school_status_idx").on(table.schoolId, table.status),
]);

export const classrooms = pgTable("classrooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  academicYearId: uuid("academic_year_id").notNull(),
  gradeId: uuid("grade_id").notNull(),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  capacity: integer("capacity"),
  status: recordStatus("status").default("ACTIVE").notNull(),
  ...timestamps,
}, (table) => [
  unique("classrooms_school_id_unique").on(table.schoolId, table.id),
  unique("classrooms_school_year_code_unique").on(table.schoolId, table.academicYearId, table.code),
  unique("classrooms_school_id_year_unique").on(table.schoolId, table.id, table.academicYearId),
  unique("classrooms_school_id_grade_unique").on(table.schoolId, table.id, table.gradeId),
  foreignKey({
    columns: [table.schoolId, table.academicYearId],
    foreignColumns: [academicYears.schoolId, academicYears.id],
    name: "classrooms_school_academic_year_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.gradeId],
    foreignColumns: [grades.schoolId, grades.id],
    name: "classrooms_school_grade_fk",
  }).onDelete("restrict"),
  check("classrooms_capacity_check", sql`${table.capacity} is null or ${table.capacity} > 0`),
  index("classrooms_school_year_grade_idx").on(table.schoolId, table.academicYearId, table.gradeId),
]);

/**
 * A teacher's mandatory weekly teaching hours for one academic year.
 *
 * Stored per year rather than on the teacher, because the obligation is agreed
 * for a year and next year's contract is a different number; storing it on the
 * profile would silently rewrite history every September. A teacher with no row
 * has no stated obligation, which is different from an obligation of zero.
 *
 * The requirement is compared against the hours the teacher's timetable entries
 * carry, so a one-hour slot that happens to be shared between two teachers still
 * counts as one hour in each of their totals — the school bought one hour of
 * teaching, and each teacher is accountable for having taken it.
 */
export const teacherWeeklyHourRequirements = pgTable("teacher_weekly_hour_requirements", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  academicYearId: uuid("academic_year_id").notNull(),
  teacherMembershipId: uuid("teacher_membership_id").notNull(),
  requiredWeeklyHours: integer("required_weekly_hours").notNull(),
  ...timestamps,
}, (table) => [
  unique("teacher_weekly_hour_requirements_membership_year_unique").on(table.schoolId, table.teacherMembershipId, table.academicYearId),
  foreignKey({
    columns: [table.schoolId, table.academicYearId],
    foreignColumns: [academicYears.schoolId, academicYears.id],
    name: "teacher_weekly_hour_requirements_school_year_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.teacherMembershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "teacher_weekly_hour_requirements_school_membership_fk",
  }).onDelete("restrict"),
  check("teacher_weekly_hour_requirements_hours_check", sql`${table.requiredWeeklyHours} >= 0`),
  index("teacher_weekly_hour_requirements_school_year_idx").on(table.schoolId, table.academicYearId),
]);

/**
 * One teaching hour of one period of one weekday: who teaches what, for a class.
 *
 * A period is naturally two hours, so a period holds two of these rows — hour 1
 * and hour 2 — and each names its own subject and its own teacher. That is what
 * makes the three shapes the school actually uses expressible without a mode
 * column: two rows with the same teacher and subject are a full two-hour lesson
 * (the interface draws them as one joined cell), one row alone is a single hour,
 * and two rows with different teachers or subjects are a split period. The old
 * model carried a nullable partner teacher and a rotation mode to say the same
 * thing, which could only ever express two teachers sharing *one* subject on
 * alternating weeks, and could not express a period whose two hours are two
 * different lessons at all.
 *
 * Because a row is one hour, the hours a teacher is assigned is the count of
 * their rows — there is no duration column to disagree with, and the assigned
 * hours report is a count rather than a sum over a figure the caller supplied.
 *
 * The row is also what attendance keys on: a session is one hour of one period on
 * one date, so its subject and its responsible teacher come from the row itself
 * and are never ambiguous, even when the two hours of a period are different
 * lessons.
 */
export const timetableEntries = pgTable("timetable_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  academicYearId: uuid("academic_year_id").notNull(),
  classroomId: uuid("classroom_id").notNull(),
  periodId: uuid("period_id").notNull(),
  // 1 = Saturday through 7 = Friday, the school's own week.
  dayOfWeek: integer("day_of_week").notNull(),
  // Which hour of the period this is: 1 for the first, 2 for the second.
  hourIndex: integer("hour_index").notNull(),
  subjectId: uuid("subject_id").notNull(),
  teacherMembershipId: uuid("teacher_membership_id").notNull(),
  status: recordStatus("status").default("ACTIVE").notNull(),
  ...timestamps,
}, (table) => [
  unique("timetable_entries_school_id_id_unique").on(table.schoolId, table.id),
  // One assignment per hour of a slot, so a class can never be double-booked and
  // a period can never hold three hours' worth of lessons.
  unique("timetable_entries_classroom_hour_unique").on(table.schoolId, table.classroomId, table.dayOfWeek, table.periodId, table.hourIndex),
  // Composite references are what make "the same school, the same year, the same
  // period" structural rather than a convention code has to remember.
  foreignKey({
    columns: [table.schoolId, table.classroomId, table.academicYearId],
    foreignColumns: [classrooms.schoolId, classrooms.id, classrooms.academicYearId],
    name: "timetable_entries_school_classroom_year_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.periodId],
    foreignColumns: [schoolPeriods.schoolId, schoolPeriods.id],
    name: "timetable_entries_school_period_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.subjectId],
    foreignColumns: [subjects.schoolId, subjects.id],
    name: "timetable_entries_school_subject_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.teacherMembershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "timetable_entries_school_teacher_fk",
  }).onDelete("restrict"),
  check("timetable_entries_day_of_week_check", sql`${table.dayOfWeek} between 1 and 7`),
  // A period holds exactly two hours, so the hour index can only be 1 or 2.
  check("timetable_entries_hour_index_check", sql`${table.hourIndex} between 1 and 2`),
  // Teacher-side lookup: "which hours does this teacher hold?" is the query behind
  // assigned-hours reporting, the clash check, and the teacher's own day view.
  index("timetable_entries_school_teacher_idx").on(table.schoolId, table.teacherMembershipId, table.status),
  index("timetable_entries_school_classroom_day_idx").on(table.schoolId, table.classroomId, table.dayOfWeek),
]);

export const students = pgTable("students", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  admissionNumber: varchar("admission_number", { length: 64 }).notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  nationalId: varchar("national_id", { length: 32 }),
  birthDate: date("birth_date", { mode: "string" }),
  status: studentStatus("status").default("ACTIVE").notNull(),
  ...timestamps,
}, (table) => [
  unique("students_school_admission_unique").on(table.schoolId, table.admissionNumber),
  unique("students_school_id_id_unique").on(table.schoolId, table.id),
  uniqueIndex("students_school_national_id_unique").on(table.schoolId, table.nationalId).where(sql`national_id is not null`),
  index("students_school_status_name_idx").on(table.schoolId, table.status, table.lastName, table.firstName),
]);

export const guardians = pgTable("guardians", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  normalizedMobile: varchar("normalized_mobile", { length: 20 }),
  email: varchar("email", { length: 320 }),
  status: recordStatus("status").default("ACTIVE").notNull(),
  ...timestamps,
}, (table) => [
  unique("guardians_school_id_id_unique").on(table.schoolId, table.id),
  uniqueIndex("guardians_school_mobile_unique").on(table.schoolId, table.normalizedMobile).where(sql`normalized_mobile is not null`),
  index("guardians_school_status_name_idx").on(table.schoolId, table.status, table.lastName, table.firstName),
]);

export const studentGuardians = pgTable("student_guardians", {
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  studentId: uuid("student_id").notNull(),
  guardianId: uuid("guardian_id").notNull(),
  relationshipType: varchar("relationship_type", { length: 64 }).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  receivesSms: boolean("receives_sms").default(false).notNull(),
  isEmergency: boolean("is_emergency").default(false).notNull(),
  ...timestamps,
}, (table) => [
  primaryKey({ columns: [table.schoolId, table.studentId, table.guardianId] }),
  foreignKey({
    columns: [table.schoolId, table.studentId],
    foreignColumns: [students.schoolId, students.id],
    name: "student_guardians_school_student_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.guardianId],
    foreignColumns: [guardians.schoolId, guardians.id],
    name: "student_guardians_school_guardian_fk",
  }).onDelete("restrict"),
  uniqueIndex("student_guardians_one_primary_idx").on(table.schoolId, table.studentId).where(sql`is_primary = true`),
  index("student_guardians_school_guardian_idx").on(table.schoolId, table.guardianId),
]);

export const enrollments = pgTable("enrollments", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  studentId: uuid("student_id").notNull(),
  academicYearId: uuid("academic_year_id").notNull(),
  classroomId: uuid("classroom_id").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  status: recordStatus("status").default("ACTIVE").notNull(),
  ...timestamps,
}, (table) => [
  unique("enrollments_school_id_classroom_unique").on(table.schoolId, table.id, table.classroomId),
  foreignKey({
    columns: [table.schoolId, table.studentId],
    foreignColumns: [students.schoolId, students.id],
    name: "enrollments_school_student_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.academicYearId],
    foreignColumns: [academicYears.schoolId, academicYears.id],
    name: "enrollments_school_academic_year_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.classroomId, table.academicYearId],
    foreignColumns: [classrooms.schoolId, classrooms.id, classrooms.academicYearId],
    name: "enrollments_school_classroom_year_fk",
  }).onDelete("restrict"),
  check("enrollments_date_order_check", sql`${table.endDate} is null or ${table.startDate} < ${table.endDate}`),
  index("enrollments_school_year_classroom_idx").on(table.schoolId, table.academicYearId, table.classroomId),
  index("enrollments_school_student_year_idx").on(table.schoolId, table.studentId, table.academicYearId, table.startDate),
  index("enrollments_school_student_effective_idx").on(table.schoolId, table.studentId, table.startDate, table.endDate),
]);

export const attendanceSessions = pgTable("attendance_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  classroomId: uuid("classroom_id").notNull(),
  academicYearId: uuid("academic_year_id").notNull(),
  businessDate: date("business_date", { mode: "string" }).notNull(),
  // The period this register covers, not one of its hours. A split period is one
  // occasion whose responsibility alternates weekly between the two teachers who
  // hold its hours, so it is registered once — by whichever of them the week names
  // — rather than once per hour. The classroom and year are carried explicitly so
  // the row stays a complete tenant-scoped record on its own.
  periodId: uuid("period_id").notNull(),
  // Who is responsible for this occurrence. For a period one teacher holds, that
  // teacher; for a split one, the teacher the week resolved to. Stored rather than
  // re-derived so the record names the person who owed the submission even after
  // the timetable or the rotation has moved on.
  teacherMembershipId: uuid("teacher_membership_id").notNull(),
  // Which shift the school was in on this date, resolved from the configuration
  // when the session was opened. Stored rather than re-derived because a rotating
  // school's answer depends on the rotation anchor, and a report about "the
  // morning of 5 Azar" must keep meaning the shift that actually ran even if the
  // anchor is later changed.
  applicableShift: applicableShift("applicable_shift").notNull(),
  status: attendanceSessionStatus("status").default("OPEN").notNull(),
  createdByMembershipId: uuid("created_by_membership_id").notNull(),
  // When this occurrence's attendance must be submitted by, computed from the
  // school's submission window and the period's end time at session creation.
  // Stored rather than derived because the deadline a teacher was working to must
  // not move when the school later edits its timetable or its policy.
  submissionDeadlineAt: timestamp("submission_deadline_at", { withTimezone: true, mode: "date" }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
  ...timestamps,
}, (table) => [
  unique("attendance_sessions_school_id_classroom_unique").on(table.schoolId, table.id, table.classroomId),
  unique("attendance_sessions_school_id_id_unique").on(table.schoolId, table.id),
  // One session per classroom period on a date. A split period is one register for
  // the whole period, because its two hours are one occasion that one teacher owes
  // in any given week; its two subjects stay in the timetable, where they belong.
  unique("attendance_sessions_school_period_date_unique").on(table.schoolId, table.classroomId, table.periodId, table.businessDate),
  foreignKey({
    columns: [table.schoolId, table.classroomId, table.academicYearId],
    foreignColumns: [classrooms.schoolId, classrooms.id, classrooms.academicYearId],
    name: "attendance_sessions_school_classroom_year_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.periodId],
    foreignColumns: [schoolPeriods.schoolId, schoolPeriods.id],
    name: "attendance_sessions_school_period_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.teacherMembershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "attendance_sessions_school_teacher_membership_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.createdByMembershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "attendance_sessions_school_creator_membership_fk",
  }).onDelete("restrict"),
  index("attendance_sessions_school_classroom_date_idx").on(table.schoolId, table.classroomId, table.businessDate),
  index("attendance_sessions_school_teacher_date_idx").on(table.schoolId, table.teacherMembershipId, table.businessDate),
  index("attendance_sessions_school_status_deadline_idx").on(table.schoolId, table.status, table.submissionDeadlineAt),
]);

export const attendanceRecords = pgTable("attendance_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  attendanceSessionId: uuid("attendance_session_id").notNull(),
  enrollmentId: uuid("enrollment_id").notNull(),
  classroomId: uuid("classroom_id").notNull(),
  status: attendanceStatus("status").notNull(),
  note: text("note"),
  // Who recorded this status *first*. A later correction does not overwrite it,
  // because "who took the register" and "who last touched it" are different facts
  // and only the first survives if one column carries both: an admin correcting a
  // teacher's register would erase the evidence that the teacher ever submitted it.
  recordedByMembershipId: uuid("recorded_by_membership_id").notNull(),
  // Set the first time a School Admin changes an already-recorded status, and never
  // cleared. The tag the interface shows is derived from `adminEditedAt` being
  // non-null, so "was this ever touched by an administrator" stays true across any
  // number of further edits — by the admin again or by the teacher inside their
  // window — which is what makes the indicator honest rather than a record of the
  // last keystroke. Null means no administrator has ever modified it.
  adminEditedAt: timestamp("admin_edited_at", { withTimezone: true, mode: "date" }),
  adminEditedByMembershipId: uuid("admin_edited_by_membership_id"),
  ...timestamps,
}, (table) => [
  unique("attendance_records_school_id_unique").on(table.schoolId, table.id),
  unique("attendance_records_session_enrollment_unique").on(table.schoolId, table.attendanceSessionId, table.enrollmentId),
  // Both admin-edit columns are present together or absent together: a timestamp
  // with no administrator, or an administrator with no timestamp, would be a half
  // answer to the one question the pair exists to answer.
  check("attendance_records_admin_edit_pair_check", sql`(
    (${table.adminEditedAt} is null and ${table.adminEditedByMembershipId} is null)
    or (${table.adminEditedAt} is not null and ${table.adminEditedByMembershipId} is not null)
  )`),
  foreignKey({
    columns: [table.schoolId, table.attendanceSessionId, table.classroomId],
    foreignColumns: [attendanceSessions.schoolId, attendanceSessions.id, attendanceSessions.classroomId],
    name: "attendance_records_school_session_classroom_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.enrollmentId, table.classroomId],
    foreignColumns: [enrollments.schoolId, enrollments.id, enrollments.classroomId],
    name: "attendance_records_school_enrollment_classroom_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.recordedByMembershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "attendance_records_school_recorder_membership_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.adminEditedByMembershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "attendance_records_school_admin_editor_membership_fk",
  }).onDelete("restrict"),
  index("attendance_records_school_session_idx").on(table.schoolId, table.attendanceSessionId),
  index("attendance_records_school_enrollment_idx").on(table.schoolId, table.enrollmentId),
]);

export const classActivities = pgTable("class_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  classroomId: uuid("classroom_id").notNull(),
  academicYearId: uuid("academic_year_id").notNull(),
  activityDate: date("activity_date", { mode: "string" }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description"),
  createdByMembershipId: uuid("created_by_membership_id").notNull(),
  status: recordStatus("status").default("ACTIVE").notNull(),
  ...timestamps,
}, (table) => [
  unique("class_activities_school_id_classroom_unique").on(table.schoolId, table.id, table.classroomId),
  foreignKey({
    columns: [table.schoolId, table.classroomId, table.academicYearId],
    foreignColumns: [classrooms.schoolId, classrooms.id, classrooms.academicYearId],
    name: "class_activities_school_classroom_year_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.createdByMembershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "class_activities_school_creator_membership_fk",
  }).onDelete("restrict"),
  index("class_activities_school_classroom_date_idx").on(table.schoolId, table.classroomId, table.activityDate),
]);

export const activityRecords = pgTable("activity_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  classActivityId: uuid("class_activity_id").notNull(),
  enrollmentId: uuid("enrollment_id").notNull(),
  classroomId: uuid("classroom_id").notNull(),
  outcome: varchar("outcome", { length: 64 }).notNull(),
  note: text("note"),
  recordedByMembershipId: uuid("recorded_by_membership_id").notNull(),
  ...timestamps,
}, (table) => [
  unique("activity_records_school_id_unique").on(table.schoolId, table.id),
  unique("activity_records_activity_enrollment_unique").on(table.schoolId, table.classActivityId, table.enrollmentId),
  foreignKey({
    columns: [table.schoolId, table.classActivityId, table.classroomId],
    foreignColumns: [classActivities.schoolId, classActivities.id, classActivities.classroomId],
    name: "activity_records_school_activity_classroom_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.enrollmentId, table.classroomId],
    foreignColumns: [enrollments.schoolId, enrollments.id, enrollments.classroomId],
    name: "activity_records_school_enrollment_classroom_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.recordedByMembershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "activity_records_school_recorder_membership_fk",
  }).onDelete("restrict"),
  index("activity_records_school_activity_idx").on(table.schoolId, table.classActivityId),
  index("activity_records_school_enrollment_idx").on(table.schoolId, table.enrollmentId),
]);

export const notificationOutbox = pgTable("notification_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  eventType: notificationEventType("event_type").notNull(),
  attendanceRecordId: uuid("attendance_record_id"),
  activityRecordId: uuid("activity_record_id"),
  guardianId: uuid("guardian_id").notNull(),
  recipientMobile: varchar("recipient_mobile", { length: 20 }).notNull(),
  message: text("message").notNull(),
  policyDecision: boolean("policy_decision").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
  status: notificationStatus("status").default("PENDING").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  lastError: text("last_error"),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  ...timestamps,
}, (table) => [
  unique("notification_outbox_school_id_unique").on(table.schoolId, table.id),
  unique("notification_outbox_school_idempotency_unique").on(table.schoolId, table.idempotencyKey),
  foreignKey({
    columns: [table.schoolId, table.attendanceRecordId],
    foreignColumns: [attendanceRecords.schoolId, attendanceRecords.id],
    name: "notification_outbox_school_attendance_record_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.activityRecordId],
    foreignColumns: [activityRecords.schoolId, activityRecords.id],
    name: "notification_outbox_school_activity_record_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.guardianId],
    foreignColumns: [guardians.schoolId, guardians.id],
    name: "notification_outbox_school_guardian_fk",
  }).onDelete("restrict"),
  check("notification_outbox_source_check", sql`(
    (${table.eventType} = 'ATTENDANCE' and ${table.attendanceRecordId} is not null and ${table.activityRecordId} is null)
    or (${table.eventType} = 'ACTIVITY' and ${table.activityRecordId} is not null and ${table.attendanceRecordId} is null)
  )`),
  check("notification_outbox_attempt_count_check", sql`${table.attemptCount} >= 0`),
  index("notification_outbox_pending_idx").on(table.schoolId, table.status, table.nextAttemptAt),
  index("notification_outbox_created_idx").on(table.schoolId, table.createdAt),
]);

export const notificationLogs = pgTable("notification_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  notificationOutboxId: uuid("notification_outbox_id").notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  providerMessageId: varchar("provider_message_id", { length: 255 }),
  status: notificationAttemptStatus("status").notNull(),
  response: jsonb("response").$type<Record<string, unknown> | null>(),
  errorCategory: varchar("error_category", { length: 64 }),
  attemptedAt: timestamp("attempted_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  ...timestamps,
}, (table) => [
  unique("notification_logs_school_id_unique").on(table.schoolId, table.id),
  foreignKey({
    columns: [table.schoolId, table.notificationOutboxId],
    foreignColumns: [notificationOutbox.schoolId, notificationOutbox.id],
    name: "notification_logs_school_outbox_fk",
  }).onDelete("restrict"),
  index("notification_logs_school_outbox_idx").on(table.schoolId, table.notificationOutboxId),
]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => schools.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  actorMembershipId: uuid("actor_membership_id"),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: text("entity_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.schoolId, table.actorMembershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "audit_logs_school_membership_fk",
  }).onDelete("restrict"),
  index("audit_logs_school_occurred_idx").on(table.schoolId, table.occurredAt),
  index("audit_logs_actor_occurred_idx").on(table.actorUserId, table.occurredAt),
]);
