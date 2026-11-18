import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getEnv } from "@/lib/env";

/**
 * Authentication configuration boundary.
 * Better Auth owns global identity and session persistence; domain membership
 * remains the source of truth for school authorization.
 */
export function getAuth() {
  const env = getEnv();

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema,
      usePlural: true,
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
    },
  });
}
