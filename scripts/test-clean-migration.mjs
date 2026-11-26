import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import process from "node:process";

import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const temporaryDatabase = `zangyar_migration_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";

function quoteIdentifier(value) {
  return `\"${value.replaceAll('"', '\\"')}\"`;
}

const admin = new Client({ connectionString: adminUrl.toString() });
let created = false;

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quoteIdentifier(temporaryDatabase)}`);
  created = true;

  const migrationUrl = new URL(sourceUrl);
  migrationUrl.pathname = `/${temporaryDatabase}`;
  const result = spawnSync("corepack", ["pnpm", "drizzle-kit", "migrate"], {
    env: { ...process.env, DATABASE_URL: migrationUrl.toString() },
    encoding: "utf8",
    shell: true,
  });
  const migrationOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.replaceAll("\r", "\n");
  console.log(migrationOutput.split("\n").filter((line) => !line.includes("applying migrations")).join("\n").trim());

  if (result.status !== 0) {
    throw new Error(`drizzle-kit migrate failed with exit code ${result.status ?? 1}`);
  }

  const migrated = new Client({ connectionString: migrationUrl.toString() });
  await migrated.connect();
  const { rows } = await migrated.query(`
    select
      to_regclass('public."user"') as auth_user,
      to_regclass('public.session') as auth_session,
      to_regclass('public.schools') as schools,
      to_regclass('public.school_memberships') as memberships,
      to_regclass('public.school_settings') as school_settings,
      to_regclass('public.academic_years') as academic_years,
      to_regclass('public.classrooms') as classrooms,
      to_regclass('public.students') as students,
      to_regclass('public.school_periods') as school_periods,
      to_regclass('public.school_operating_days') as school_operating_days,
      to_regclass('public.timetable_entries') as timetable_entries,
      to_regclass('public.teacher_weekly_hour_requirements') as teacher_weekly_hour_requirements,
      to_regclass('public.guardians') as guardians,
      to_regclass('public.student_guardians') as student_guardians,
      to_regclass('public.enrollments') as enrollments,
      to_regclass('public.attendance_sessions') as attendance_sessions,
      to_regclass('public.attendance_records') as attendance_records,
      to_regclass('public.notification_outbox') as notification_outbox,
      to_regclass('public.audit_logs') as audit_logs,
      to_regclass('public.teacher_profiles') as teacher_profiles,
      to_regclass('public.teacher_registrations') as teacher_registrations,
      to_regclass('public.otp_challenges') as otp_challenges
    `);
  const constraints = await migrated.query(`
    select conname from pg_constraint
    where conrelid = 'public.enrollments'::regclass
      and conname = 'enrollments_no_student_year_overlap'
  `);
  // A migration can apply "successfully" and still leave an object missing, so the
  // removed table is asserted absent as well as the new one present.
  const dropped = await migrated.query(`
    select
      to_regclass('public.teacher_invitations') as teacher_invitations,
      to_regclass('public.class_teachers') as class_teachers,
      to_regclass('public.attendance_session_kind') as attendance_session_kind,
      to_regclass('public.school_shifts') as school_shifts,
      to_regclass('public.school_shift_periods') as school_shift_periods,
      to_regclass('public.period_assignment_scope') as period_assignment_scope,
      to_regclass('public.timetable_rotation') as timetable_rotation
  `);
  // The approval states must exist as enum values, or every teacher insert fails.
  const enumValues = await migrated.query(`
    select unnest(enum_range(null::public.membership_status))::text as value
  `);
  const otpValues = await migrated.query(`
    select unnest(enum_range(null::public.otp_purpose))::text as value
  `);
  const columnRows = await migrated.query(`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and table_name in ('attendance_sessions', 'school_periods', 'timetable_entries', 'classrooms')
  `);
  const columnsByTable = new Map();
  for (const row of columnRows.rows) {
    columnsByTable.set(row.table_name, [...(columnsByTable.get(row.table_name) ?? []), row.column_name]);
  }
  await migrated.end();

  const missing = Object.entries(rows[0]).filter(([, value]) => value === null).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Clean migration omitted tables: ${missing.join(", ")}`);
  }
  if (constraints.rows.length !== 1) {
    throw new Error("Clean migration omitted enrollment overlap constraint.");
  }
  if (dropped.rows[0].teacher_invitations !== null) {
    throw new Error("Clean migration did not drop teacher_invitations.");
  }
  if (dropped.rows[0].class_teachers !== null) {
    throw new Error("Clean migration did not drop class_teachers.");
  }
  if (dropped.rows[0].attendance_session_kind !== null) {
    throw new Error("Clean migration did not drop the attendance_session_kind enum.");
  }
  if (dropped.rows[0].school_shifts !== null || dropped.rows[0].school_shift_periods !== null) {
    throw new Error("Clean migration did not drop the per-shift tables.");
  }
  if (dropped.rows[0].period_assignment_scope !== null || dropped.rows[0].timetable_rotation !== null) {
    throw new Error("Clean migration did not drop the per-assignment scope and rotation enums.");
  }
  // Checked per table, because the two disagree on purpose: a period has no hour
  // count (the assignment does) and no kind or label at all.
  const timetableColumns = new Set(columnsByTable.get("timetable_entries") ?? []);
  for (const required of ["hour_index", "period_id", "teacher_membership_id"]) {
    if (!timetableColumns.has(required)) {
      throw new Error(`Clean migration omitted timetable_entries column: ${required}`);
    }
  }
  // The scope, the hours, and the second teacher are the shape this migration
  // replaced: an assignment is one hour now, so it states its hour and nothing
  // about how much of the period it takes.
  for (const removed of ["shift_id", "scope", "hour_count", "primary_teacher_membership_id", "partner_teacher_membership_id", "rotation", "rotation_base_date"]) {
    if (timetableColumns.has(removed)) {
      throw new Error(`Clean migration left timetable_entries.${removed} behind.`);
    }
  }
  // A class names no teacher of its own any more; its teachers are its hours.
  const classroomColumns = new Set(columnsByTable.get("classrooms") ?? []);
  if (classroomColumns.has("homeroom_teacher_membership_id")) {
    throw new Error("Clean migration left classrooms.homeroom_teacher_membership_id behind.");
  }
  const periodColumns = new Set(columnsByTable.get("school_periods") ?? []);
  for (const removed of ["kind", "label", "hour_count", "shift_id"]) {
    if (periodColumns.has(removed)) {
      throw new Error(`Clean migration left school_periods.${removed} behind.`);
    }
  }
  const phaseSixColumnNames = new Set(columnsByTable.get("attendance_sessions") ?? []);
  for (const required of ["timetable_entry_id", "subject_id", "teacher_membership_id", "submission_deadline_at", "applicable_shift"]) {
    if (!phaseSixColumnNames.has(required)) {
      throw new Error(`Clean migration omitted attendance_sessions column: ${required}`);
    }
  }
  if (phaseSixColumnNames.has("session_kind")) {
    throw new Error("Clean migration left attendance_sessions.session_kind behind.");
  }
  const membershipValues = new Set(enumValues.rows.map((row) => row.value));
  for (const required of ["ACTIVE", "SUSPENDED", "REVOKED", "PENDING_ADMIN_APPROVAL", "REJECTED"]) {
    if (!membershipValues.has(required)) {
      throw new Error(`Clean migration omitted membership_status value: ${required}`);
    }
  }
  const purposeValues = new Set(otpValues.rows.map((row) => row.value));
  if (!purposeValues.has("TEACHER_REGISTRATION")) {
    throw new Error("Clean migration omitted otp_purpose value: TEACHER_REGISTRATION");
  }

  console.log(`Clean migration passed in database ${temporaryDatabase}.`);
} finally {
  if (created) {
    await admin.query(`DROP DATABASE ${quoteIdentifier(temporaryDatabase)}`);
  }
  await admin.end();
}

