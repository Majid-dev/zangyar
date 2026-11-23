import { createHash, randomBytes } from "node:crypto";

import "server-only";

import { getEnv } from "@/lib/env";

/**
 * Invitation tokens.
 *
 * The token is a 256-bit random value, so a plain SHA-256 hash is the right
 * storage primitive: a slow KDF defends low-entropy secrets such as passwords,
 * not 32 random bytes. Only the hash is persisted, so a database read cannot
 * recover a usable link.
 */

const TOKEN_BYTES = 32;

/** Fresh, URL-safe, cryptographically secure invitation token. */
export function generateInvitationToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Deterministic lookup value stored in the database for a plaintext token. */
export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Configured invitation lifetime in hours. */
export function invitationTtlHours() {
  return getEnv().TEACHER_INVITATION_TTL_HOURS;
}

/**
 * Expiry timestamp for a token issued at `now`. The lifetime is passed
 * explicitly so the rule can be exercised without environment setup.
 */
export function invitationExpiry(now: Date, ttlHours: number) {
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}
