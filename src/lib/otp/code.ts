import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * OTP code generation, hashing, and verification.
 *
 * ## Why the hash is keyed
 *
 * A six-digit code has only 10^6 possible values. A bare SHA-256 of it would be
 * exhaustible offline in milliseconds from a leaked row — unlike a high-entropy
 * secret such as a 256-bit random token, where a plain digest is the correct
 * primitive because the input already carries full entropy.
 *
 * The code is therefore hashed with HMAC-SHA256 under a server-side secret, so a
 * database-only leak yields nothing brute-forceable without the application
 * secret. Comparison uses `timingSafeEqual` so verification does not leak the
 * code through response timing.
 */

/** Digits only, so a code is unambiguous to read aloud and to type. */
export function generateOtpCode(length: number) {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

/** Keyed digest stored in place of the code. Deterministic for a given secret. */
export function hashOtpCode(code: string, secret: string) {
  return createHmac("sha256", secret).update(code).digest("hex");
}

/**
 * Constant-time comparison of a candidate code against a stored digest.
 *
 * The expected digest is recomputed from the candidate's own length, so a
 * mismatched length cannot throw the way `timingSafeEqual` does on unequal
 * buffers — that would turn a wrong-length input into a distinguishable error.
 */
export function verifyOtpCode(code: string, expectedHash: string, secret: string) {
  const candidate = Buffer.from(hashOtpCode(code, secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/**
 * Expiry instant for a code issued at `now`.
 *
 * Takes both arguments explicitly rather than reading the clock or configuration
 * inside, so the rule can be exercised in tests without environment setup.
 */
export function otpExpiry(now: Date, expirySeconds: number) {
  return new Date(now.getTime() + expirySeconds * 1000);
}
