import { describe, expect, it } from "vitest";

import { GUARDIAN_RELATIONSHIPS, isPresetGuardianRelationship } from "./relationships";

describe("guardian relationships", () => {
  it("contains approved Persian presets", () => {
    expect(GUARDIAN_RELATIONSHIPS).toEqual([
      "پدر", "مادر", "پدربزرگ", "مادربزرگ", "برادر", "خواهر",
      "عمو", "عمه", "دایی", "خاله", "سرپرست قانونی", "سایر",
    ]);
  });

  it("recognizes presets but preserves legacy custom values", () => {
    expect(isPresetGuardianRelationship("مادر")).toBe(true);
    expect(isPresetGuardianRelationship("قیم")).toBe(false);
  });
});
