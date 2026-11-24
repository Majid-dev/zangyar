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
    stdio: "inherit",
    shell: true,
  });

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
      to_regclass('public.class_teachers') as class_teachers,
      to_regclass('public.students') as students,
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
    select to_regclass('public.teacher_invitations') as teacher_invitations
  `);
  // The approval states must exist as enum values, or every teacher insert fails.
  const enumValues = await migrated.query(`
    select unnest(enum_range(null::public.membership_status))::text as value
  `);
  const otpValues = await migrated.query(`
    select unnest(enum_range(null::public.otp_purpose))::text as value
  `);
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

