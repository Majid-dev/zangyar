import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import process from "node:process";

import { Client } from "pg";
import { config } from "dotenv";

/**
 * Runs the persisted teacher registration suites inside an ephemeral, freshly
 * migrated database so they never touch local development data.
 *
 * Usage: corepack pnpm test:integration:teachers
 */
config({ path: ".env.local" });

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const temporaryDatabase = `zangyar_teachers_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '\\"')}"`;
}

const admin = new Client({ connectionString: adminUrl.toString() });
let created = false;

const SUITES = [
  "src/features/teachers/auth-transaction.integration.test.ts",
  "src/features/teachers/teachers.integration.test.ts",
];

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quoteIdentifier(temporaryDatabase)}`);
  created = true;

  const testUrl = new URL(sourceUrl);
  testUrl.pathname = `/${temporaryDatabase}`;

  const migrate = spawnSync("corepack", ["pnpm", "drizzle-kit", "migrate"], {
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    stdio: "inherit",
    shell: true,
  });
  if (migrate.status !== 0) throw new Error(`Migration failed with exit code ${migrate.status ?? 1}`);

  // These suites share tenant rows, so they must not run in parallel workers
  // against the same database. The suite paths are positional filters: passing a
  // bare `--` before them makes vitest treat them as ignored, so it is omitted.
  const test = spawnSync("corepack", ["pnpm", "test", "--no-file-parallelism", ...SUITES], {
    env: {
      ...process.env,
      DATABASE_URL: testUrl.toString(),
      RUN_DB_INTEGRATION_TESTS: "1",
      NODE_ENV: "development",
    },
    stdio: "inherit",
    shell: true,
  });
  if (test.status !== 0) throw new Error(`Teacher integration tests failed with exit code ${test.status ?? 1}`);

  console.log(`Teacher integration passed in database ${temporaryDatabase}.`);
} finally {
  if (created) await admin.query(`DROP DATABASE ${quoteIdentifier(temporaryDatabase)}`);
  await admin.end();
}
