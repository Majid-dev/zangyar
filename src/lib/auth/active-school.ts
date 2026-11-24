import "server-only";

import { cookies } from "next/headers";

/**
 * The user's persisted school selection.
 *
 * A membership is the *authority* for school access; this cookie is only a
 * *preference* among memberships the user already has. It is therefore never
 * authorization: `requireSchoolAccess` resolves it against the verified active
 * memberships and ignores a value that matches none. That is what keeps the
 * "never trust a client-supplied schoolId" rule intact — a forged cookie can
 * only ever name a school the user cannot reach, and is discarded rather than
 * honored.
 *
 * The value is the school id, and it is only ever read back through the UUID
 * check below, so a hand-edited cookie cannot reach a query as arbitrary text.
 */
export const ACTIVE_SCHOOL_COOKIE = "zangyar.active_school";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A year, so a teacher's chosen school survives a long break between sessions. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Reads the preferred school from a raw `Cookie` header.
 *
 * Parsed from the passed header rather than from `cookies()` so the same value is
 * available to the authorization helpers, which receive `Headers` and are also
 * exercised directly by tests.
 */
export function parseActiveSchoolPreference(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== ACTIVE_SCHOOL_COOKIE) continue;

    const raw = part.slice(separator + 1).trim();
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // A malformed escape sequence is not a school id; treat it as absent.
      return null;
    }
    return UUID_PATTERN.test(value) ? value.toLowerCase() : null;
  }

  return null;
}

export function readActiveSchoolPreference(headers: Headers): string | null {
  return parseActiveSchoolPreference(headers.get("cookie"));
}

/**
 * Persists the selection. HttpOnly because no script needs to read it, and
 * SameSite=Lax so it rides normal navigations without being sent cross-site.
 */
export async function writeActiveSchoolPreference(schoolId: string) {
  const store = await cookies();
  store.set(ACTIVE_SCHOOL_COOKIE, schoolId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

/** Drops the selection, so a session that ends leaves no school context behind. */
export async function clearActiveSchoolPreference() {
  const store = await cookies();
  store.delete(ACTIVE_SCHOOL_COOKIE);
}
