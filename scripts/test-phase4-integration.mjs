import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import process from "node:process";

import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const temporaryDatabase = `zangyar_phase4_${randomUUID().replaceAll("-", "")}`;
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

  const testUrl = new URL(sourceUrl);
  testUrl.pathname = `/${temporaryDatabase}`;
  const migrate = spawnSync("corepack", ["pnpm", "drizzle-kit", "migrate"], {
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    stdio: "inherit",
    shell: true,
  });
  if (migrate.status !== 0) {
    throw new Error(`Migration failed with exit code ${migrate.status ?? 1}`);
  }

  const test = spawnSync("corepack", ["pnpm", "test", "src/features/academics/academics.integration.test.ts"], {
    env: {
      ...process.env,
      DATABASE_URL: testUrl.toString(),
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    stdio: "inherit",
    shell: true,
  });
  if (test.status !== 0) {
    throw new Error(`Integration tests failed with exit code ${test.status ?? 1}`);
  }
} finally {
  if (created) {
    await admin.query(`DROP DATABASE ${quoteIdentifier(temporaryDatabase)}`);
  }
  await admin.end();
}
