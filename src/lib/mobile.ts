import { toAsciiDigits } from "./digits";

/**
 * Canonical Iranian mobile format used across ZangYar: `09XXXXXXXXX` (11 ASCII
 * digits). Login identity, guardian contact numbers, and seed data all normalize
 * through this module so a value written by one path always matches a lookup
 * performed by another.
 */
export const CANONICAL_MOBILE_PATTERN = /^09\d{9}$/;

/**
 * Normalizes any common Iranian mobile spelling to the canonical form:
 * Persian/Arabic digits, spaces, dashes, parentheses, `+98`, `0098`, and the
 * bare `9XXXXXXXXX` form are all accepted. Anything that is not a plausible
 * Iranian mobile is returned as cleaned input, so callers must validate with
 * {@link isValidIranianMobile} before trusting the result.
 */
export function normalizeIranianMobile(value: string | null | undefined) {
  if (value == null) return null;
  const cleaned = toAsciiDigits(value).trim().replace(/[\s\-()]/g, "");
  if (cleaned.length === 0) return null;

  const withoutPlus = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  if (withoutPlus.startsWith("0098")) return `0${withoutPlus.slice(4)}`;
  if (withoutPlus.startsWith("98") && withoutPlus.length >= 12) return `0${withoutPlus.slice(2)}`;
  if (withoutPlus.startsWith("9") && withoutPlus.length === 10) return `0${withoutPlus}`;
  return withoutPlus;
}

export function isValidIranianMobile(value: string | null | undefined) {
  return value == null || CANONICAL_MOBILE_PATTERN.test(value);
}

/** Contact-display helper: keeps the operator prefix and last digits readable. */
export function maskIranianMobile(value: string | null | undefined) {
  if (!value) return null;
  return value.length >= 7 ? `${value.slice(0, 4)}***${value.slice(-3)}` : "***";
}
