import type { SchoolRole } from "@/lib/auth/authorization-core";

/** Persian labels for the two school-level roles, as shown next to a name. */
export const SCHOOL_ROLE_LABELS: Record<SchoolRole, string> = {
  SCHOOL_ADMIN: "مدیر مدرسه",
  TEACHER: "دبیر",
};

export function roleLabel(role: SchoolRole | null) {
  return role ? SCHOOL_ROLE_LABELS[role] : "بدون نقش مدرسه";
}

/**
 * Up to two initials for a fallback avatar.
 *
 * Persian names are conventionally two tokens, so the first letter of the first
 * and last token is used. A single-token name yields one letter; an empty name
 * yields none, and the caller renders a neutral glyph instead. Computed with the
 * code-point iterator so a name starting outside the BMP is not split mid-character.
 */
export function nameInitials(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";

  const first = [...tokens[0]][0] ?? "";
  const last = tokens.length > 1 ? [...tokens[tokens.length - 1]][0] ?? "" : "";

  return `${first}${last}`;
}

/**
 * The name pair to show and edit, given what the account actually stores.
 *
 * A teacher has a real pair on their school-local profile, so it is used as-is.
 *
 * A global account stores only Better Auth's single `name`. Once a pair has been
 * saved it is used verbatim. Before that there is nothing to derive a split from,
 * and deriving one is exactly the bug this replaced: splitting on the first space
 * turned "محمد رحیم رستمی" into "محمد" + "رحیم رستمی", and no rejoining rule can
 * recover the original. So an unknown pair is reported as the whole name in the
 * first field and an empty last name — lossless, because `joinDisplayName` of that
 * pair is the same string again.
 */
export function nameFieldsFor(
  source: { firstName: string | null; lastName: string | null; name?: string | null } | null | undefined,
): { firstName: string; lastName: string } {
  if (source?.firstName != null) {
    return { firstName: source.firstName, lastName: source.lastName ?? "" };
  }

  return { firstName: source?.name?.trim() ?? "", lastName: "" };
}

export function joinDisplayName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

/** A school the signed-in user may enter, as the shell needs it. */
export type ShellSchool = { id: string; name: string };

/**
 * What the shell's profile menu renders.
 *
 * Assembled server-side from the verified membership context, so the menu cannot
 * show a school the user has no membership in and cannot decide for itself which
 * schools are offered. `schools` therefore carries only the options worth
 * switching between — the list is already resolved, not filtered in the browser.
 */
export type ShellProfile = {
  name: string;
  roleLabel: string;
  initials: string;
  activeSchoolId: string;
  activeSchoolName: string;
  /** Empty unless switching is both possible and useful. */
  schools: readonly ShellSchool[];
};

/**
 * The schools a switcher should offer.
 *
 * Only a teacher can belong to several schools in practice, and a switcher with a
 * single option is noise, so both conditions must hold. This is presentation
 * only: the server accepts no school without an active membership there whatever
 * the menu happens to render.
 */
export function switchableSchools(role: SchoolRole | null, schools: readonly ShellSchool[]): ShellSchool[] {
  if (role !== "TEACHER" || schools.length < 2) return [];
  return [...schools];
}


