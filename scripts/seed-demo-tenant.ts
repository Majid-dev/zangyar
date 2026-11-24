import { config } from "dotenv";
import process from "node:process";

import { seedDemoTenant } from "@/features/auth/bootstrap/seed";
import { getDemoSeedConfig, redactedSeedSummary } from "@/features/auth/bootstrap/config";
import { DemoSeedEnvironmentError } from "@/features/auth/bootstrap/environment";

/**
 * Development-only demo tenant bootstrap.
 *
 * Creates the demo school and its School Admin account (login with the demo
 * mobile number and password). Safe to run repeatedly: it never duplicates a
 * row and never resets an existing password. Refuses to run in production or
 * against a non-local database, and prints no credential.
 *
 * Usage: corepack pnpm db:seed:demo
 */
config({ path: ".env.local" });

async function main() {
  const result = await seedDemoTenant();
  const summary = redactedSeedSummary(getDemoSeedConfig());

  console.log("Demo tenant ready.");
  console.log(`  school:     ${result.school.name} (${result.school.slug})`);
  console.log(`  login:      ${summary.adminMobile}  (School Admin)`);
  console.log(`  membership: SCHOOL_ADMIN — ${result.membership.created ? "created" : result.membership.restored ? "restored to active" : "already active"}`);
  console.log(`  account:    ${result.user.created ? "created" : "existing account kept (password unchanged)"}`);
  console.log("  password:   DEMO_ADMIN_PASSWORD, or the documented local default in docs/DEVELOPMENT.md");
}

main().catch((error) => {
  if (error instanceof DemoSeedEnvironmentError) {
    console.error(`Refused: ${error.message}`);
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
