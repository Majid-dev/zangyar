import "server-only";

import { betterAuth } from "better-auth";

import { getEnv } from "@/lib/env";

/**
 * Authentication configuration boundary.
 * Domain memberships and school authorization will be added in a later phase.
 */
export function getAuth() {
  const env = getEnv();

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
    },
  });
}
