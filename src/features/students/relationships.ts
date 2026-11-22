/**
 * Guardian relationship options.
 *
 * `سایر` means "something else" and expects a free-text value alongside it. The
 * stored column stays a plain string so records created before this list existed
 * keep working: validation accepts a known option or a custom value, never
 * rejects one that is already saved.
 */
export const GUARDIAN_RELATIONSHIPS = [
  "پدر",
  "مادر",
  "پدربزرگ",
  "مادربزرگ",
  "برادر",
  "خواهر",
  "عمو",
  "عمه",
  "دایی",
  "خاله",
  "سرپرست قانونی",
  "سایر",
] as const;

export const GUARDIAN_OTHER_RELATIONSHIP = "سایر";

export type GuardianRelationship = typeof GUARDIAN_RELATIONSHIPS[number];

export function isPresetGuardianRelationship(value: string): value is GuardianRelationship {
  return (GUARDIAN_RELATIONSHIPS as readonly string[]).includes(value);
}
