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
      to_regclass('public.academic_years') as academic_years,
      to_regclass('public.classrooms') as classrooms,
      to_regclass('public.students') as students,
      to_regclass('public.guardians') as guardians,
      to_regclass('public.student_guardians') as student_guardians,
      to_regclass('public.enrollments') as enrollments
    `);
  const constraints = await migrated.query(`
    select conname from pg_constraint
    where conrelid = 'public.enrollments'::regclass
      and conname = 'enrollments_no_student_year_overlap'
  `);
  await migrated.end();

  const missing = Object.entries(rows[0]).filter(([, value]) => value === null).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Clean migration omitted tables: ${missing.join(", ")}`);
  }
  if (constraints.rows.length !== 1) {
    throw new Error("Clean migration omitted enrollment overlap constraint.");
  }

  console.log(`Clean migration passed in database ${temporaryDatabase}.`);
} finally {
  if (created) {
    await admin.query(`DROP DATABASE ${quoteIdentifier(temporaryDatabase)}`);
  }
  await admin.end();
}

