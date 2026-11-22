import {
  boolean,
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
export const membershipStatus = pgEnum("membership_status", ["ACTIVE", "SUSPENDED", "REVOKED"]);
export const academicYearStatus = pgEnum("academic_year_status", ["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]);
export const recordStatus = pgEnum("record_status", ["ACTIVE", "ARCHIVED"]);
export const studentStatus = pgEnum("student_status", ["ACTIVE", "WITHDRAWN", "GRADUATED", "ARCHIVED"]);
export const attendanceSessionKind = pgEnum("attendance_session_kind", ["DAILY", "LESSON"]);
export const attendanceSessionStatus = pgEnum("attendance_session_status", ["OPEN", "CLOSED"]);
export const attendanceStatus = pgEnum("attendance_status", ["PRESENT", "ABSENT", "LATE", "EXCUSED"]);
export const notificationEventType = pgEnum("notification_event_type", ["ATTENDANCE", "ACTIVITY"]);
export const notificationStatus = pgEnum("notification_status", ["PENDING", "PROCESSING", "SENT", "FAILED", "CANCELLED"]);
export const notificationAttemptStatus = pgEnum("notification_attempt_status", ["SENT", "FAILED", "RETRYABLE", "PERMANENT"]);

// Better Auth owns these global identity/session tables. Business entities reference user.id.
export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
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

export const schoolSettings = pgTable("school_settings", {
  schoolId: uuid("school_id").primaryKey().references(() => schools.id, { onDelete: "restrict" }),
  notifyOnPresent: boolean("notify_on_present").default(false).notNull(),
  notifyOnAbsent: boolean("notify_on_absent").default(false).notNull(),
  notifyOnLate: boolean("notify_on_late").default(false).notNull(),
  notifyOnExcused: boolean("notify_on_excused").default(false).notNull(),
  ...timestamps,
});

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

export const classTeachers = pgTable("class_teachers", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  classroomId: uuid("classroom_id").notNull(),
  teacherMembershipId: uuid("teacher_membership_id").notNull(),
  subjectId: uuid("subject_id"),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  status: recordStatus("status").default("ACTIVE").notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  ...timestamps,
}, (table) => [
  unique("class_teachers_assignment_unique").on(table.schoolId, table.classroomId, table.teacherMembershipId, table.subjectId),
  foreignKey({
    columns: [table.schoolId, table.classroomId],
    foreignColumns: [classrooms.schoolId, classrooms.id],
    name: "class_teachers_school_classroom_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.teacherMembershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "class_teachers_school_membership_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.subjectId],
    foreignColumns: [subjects.schoolId, subjects.id],
    name: "class_teachers_school_subject_fk",
  }).onDelete("restrict"),
  check("class_teachers_date_order_check", sql`${table.endDate} is null or ${table.startDate} < ${table.endDate}`),
  uniqueIndex("class_teachers_one_primary_idx").on(table.schoolId, table.classroomId).where(sql`is_primary = true and status = 'ACTIVE'`),
  index("class_teachers_school_teacher_idx").on(table.schoolId, table.teacherMembershipId, table.status),
  index("class_teachers_school_classroom_idx").on(table.schoolId, table.classroomId, table.status),
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
  sessionKind: attendanceSessionKind("session_kind").default("DAILY").notNull(),
  status: attendanceSessionStatus("status").default("OPEN").notNull(),
  createdByMembershipId: uuid("created_by_membership_id").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
  ...timestamps,
}, (table) => [
  unique("attendance_sessions_school_id_classroom_unique").on(table.schoolId, table.id, table.classroomId),
  unique("attendance_sessions_school_classroom_date_kind_unique").on(table.schoolId, table.classroomId, table.businessDate, table.sessionKind),
  foreignKey({
    columns: [table.schoolId, table.classroomId, table.academicYearId],
    foreignColumns: [classrooms.schoolId, classrooms.id, classrooms.academicYearId],
    name: "attendance_sessions_school_classroom_year_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.schoolId, table.createdByMembershipId],
    foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    name: "attendance_sessions_school_creator_membership_fk",
  }).onDelete("restrict"),
  index("attendance_sessions_school_classroom_date_idx").on(table.schoolId, table.classroomId, table.businessDate),
]);

export const attendanceRecords = pgTable("attendance_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "restrict" }),
  attendanceSessionId: uuid("attendance_session_id").notNull(),
  enrollmentId: uuid("enrollment_id").notNull(),
  classroomId: uuid("classroom_id").notNull(),
  status: attendanceStatus("status").notNull(),
  note: text("note"),
  recordedByMembershipId: uuid("recorded_by_membership_id").notNull(),
  ...timestamps,
}, (table) => [
  unique("attendance_records_school_id_unique").on(table.schoolId, table.id),
  unique("attendance_records_session_enrollment_unique").on(table.schoolId, table.attendanceSessionId, table.enrollmentId),
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
