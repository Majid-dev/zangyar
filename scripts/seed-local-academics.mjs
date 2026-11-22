import { config } from "dotenv";
import process from "node:process";

import { Client } from "pg";

config({ path: ".env.local" });
const email = process.argv[2];
if (!email) { console.error("Usage: node scripts/seed-local-academics.mjs <email>"); process.exit(1); }
const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const { rows: users } = await client.query('SELECT id FROM "user" WHERE email = $1', [email]);
  if (!users[0]) throw new Error("User not found.");
  const { rows: memberships } = await client.query("SELECT id, school_id FROM school_memberships WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1", [users[0].id]);
  if (!memberships[0]) throw new Error("Active membership not found.");
  const schoolId = memberships[0].school_id;
  await client.query("BEGIN");
  const { rows: years } = await client.query("INSERT INTO academic_years (school_id, code, name, start_date, end_date, status) VALUES ($1, '1405', 'سال تحصیلی ۱۴۰۵–۱۴۰۶', '2026-09-23', '2027-06-21', 'ACTIVE') ON CONFLICT (school_id, code) DO UPDATE SET status = 'ACTIVE' RETURNING id", [schoolId]);
  const yearId = years[0].id;
  const { rows: grades } = await client.query("INSERT INTO grades (school_id, code, name, sort_order, status) VALUES ($1, 'G1', 'پایه اول', 1, 'ACTIVE') ON CONFLICT (school_id, code) DO UPDATE SET status = 'ACTIVE' RETURNING id", [schoolId]);
  const gradeId = grades[0].id;
  await client.query("INSERT INTO subjects (school_id, code, name, status) VALUES ($1, 'MATH', 'ریاضی', 'ACTIVE') ON CONFLICT (school_id, code) DO UPDATE SET status = 'ACTIVE'", [schoolId]);
  await client.query("INSERT INTO classrooms (school_id, academic_year_id, grade_id, code, name, status) VALUES ($1, $2, $3, 'A', 'کلاس اول الف', 'ACTIVE') ON CONFLICT (school_id, academic_year_id, code) DO UPDATE SET status = 'ACTIVE'", [schoolId, yearId, gradeId]);
  await client.query("COMMIT");
  console.log(`Seeded active academic year, grade, subject, and classroom for ${email}.`);
} catch (error) { try { await client.query("ROLLBACK"); } catch {} console.error(error instanceof Error ? error.message : error); process.exitCode = 1; } finally { await client.end(); }
