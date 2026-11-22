import { config } from "dotenv";
import process from "node:process";

import { Client } from "pg";

/**
 * Local development bootstrap.
 *
 * Creates a school and an ACTIVE SCHOOL_ADMIN membership for an existing user
 * account, so the authenticated application can be opened in a browser before
 * the admin-facing account and school management screens exist.
 *
 * Additive only: it never updates or deletes existing rows, and it is a no-op if
 * the membership already exists. Development database only.
 *
 * Usage:
 *   node scripts/create-local-admin.mjs <email> [school-name] [slug]
 */

config({ path: ".env.local" });

const [email, schoolName = "مدرسه‌ی نمونه", slug = "local-demo"] = process.argv.slice(2);

if (!email) {
  console.error("Usage: node scripts/create-local-admin.mjs <email> [school-name] [slug]");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required (expected to be your local development database).");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query("BEGIN");

  const { rows: userRows } = await client.query('SELECT id FROM "user" WHERE email = $1', [email]);
  if (userRows.length === 0) {
    throw new Error(`No account found for ${email}. Sign up through the app first.`);
  }
  const userId = userRows[0].id;

  let schoolId;
  const { rows: existingMemberships } = await client.query(
    "SELECT school_id FROM school_memberships WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1",
    [userId],
  );

  if (existingMemberships.length > 0) {
    schoolId = existingMemberships[0].school_id;
    const { rows: schoolRows } = await client.query("SELECT name FROM schools WHERE id = $1", [schoolId]);
    console.log(`Active membership already exists for ${email} in "${schoolRows[0]?.name ?? schoolId}". Nothing to do.`);
  } else {
    const { rows: schoolRows } = await client.query(
      "INSERT INTO schools (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, name",
      [slug, schoolName],
    );
    schoolId = schoolRows[0].id;
    await client.query(
      "INSERT INTO school_memberships (school_id, user_id, role, status) VALUES ($1, $2, 'SCHOOL_ADMIN', 'ACTIVE')",
      [schoolId, userId],
    );
    console.log(`Created school "${schoolRows[0].name}" (${schoolId}) and SCHOOL_ADMIN membership for ${email}.`);
  }

  await client.query("COMMIT");
  console.log("Sign in at http://localhost:3000 with that account to use the authenticated app.");
} catch (error) {
  try { await client.query("ROLLBACK"); } catch {}
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
