import { describe, expect, it } from "vitest";

import { joinDisplayName, nameFieldsFor, nameInitials, roleLabel, switchableSchools } from "./profile";

describe("nameInitials", () => {
  it("uses the first letter of the first and last token", () => {
    expect(nameInitials("زهرا محمدی")).toBe("زم");
    expect(nameInitials("علی اکبر حسینی")).toBe("عح");
  });

  it("handles a single token and surrounding whitespace", () => {
    expect(nameInitials("  زهرا  ")).toBe("ز");
  });

  it("returns nothing for an empty name, so the caller can fall back", () => {
    expect(nameInitials("")).toBe("");
    expect(nameInitials("   ")).toBe("");
  });

  it("does not split an astral character", () => {
    expect(nameInitials("𐎠 𐎡")).toBe("𐎠𐎡");
  });
});

describe("nameFieldsFor", () => {
  it("uses a stored pair verbatim, however many words each part holds", () => {
    expect(nameFieldsFor({ firstName: "زهرا", lastName: "محمدی نژاد" })).toEqual({
      firstName: "زهرا",
      lastName: "محمدی نژاد",
    });
    expect(nameFieldsFor({ firstName: "زهرا محمدی", lastName: "نژاد" })).toEqual({
      firstName: "زهرا محمدی",
      lastName: "نژاد",
    });
  });

  it("treats an empty stored last name as set, not as unknown", () => {
    expect(nameFieldsFor({ firstName: "زهرا", lastName: "" })).toEqual({ firstName: "زهرا", lastName: "" });
    expect(nameFieldsFor({ firstName: "زهرا", lastName: null })).toEqual({ firstName: "زهرا", lastName: "" });
  });

  it("reports an unknown pair as the whole name, without splitting it", () => {
    // The bug this replaced: splitting "زهرا محمدی نژاد" here produced
    // "زهرا" + "محمدی نژاد", which rejoins to the same string only by luck, and
    // reordered a three-word name like "محمد رحیم رستمی".
    expect(nameFieldsFor({ firstName: null, lastName: null, name: "محمد رحیم رستمی" })).toEqual({
      firstName: "محمد رحیم رستمی",
      lastName: "",
    });
  });

  it("round-trips an unknown name through the form unchanged", () => {
    const source = { firstName: null, lastName: null, name: "محمد رحیم رستمی" };
    const fields = nameFieldsFor(source);
    expect(joinDisplayName(fields.firstName, fields.lastName)).toBe(source.name);
  });

  it("handles a missing account and an empty name", () => {
    expect(nameFieldsFor(null)).toEqual({ firstName: "", lastName: "" });
    expect(nameFieldsFor({ firstName: null, lastName: null, name: "  " })).toEqual({ firstName: "", lastName: "" });
  });

  it("joins without a trailing space for an empty last name", () => {
    expect(joinDisplayName("زهرا", "")).toBe("زهرا");
  });
});

describe("switchableSchools", () => {
  const schools = [
    { id: "school-a", name: "مدرسه الف" },
    { id: "school-b", name: "مدرسه ب" },
  ];

  it("offers every school to a teacher who belongs to more than one", () => {
    expect(switchableSchools("TEACHER", schools)).toEqual(schools);
  });

  it("offers nothing to a teacher with a single school", () => {
    expect(switchableSchools("TEACHER", [schools[0]])).toEqual([]);
  });

  it("never offers the switcher to a School Admin, even with several schools", () => {
    expect(switchableSchools("SCHOOL_ADMIN", schools)).toEqual([]);
  });

  it("offers nothing without a resolved role", () => {
    expect(switchableSchools(null, schools)).toEqual([]);
  });
});

describe("roleLabel", () => {
  it("names the school roles in Persian and has a fallback", () => {
    expect(roleLabel("SCHOOL_ADMIN")).toBe("مدیر مدرسه");
    expect(roleLabel("TEACHER")).toBe("دبیر");
    expect(roleLabel(null)).toBe("بدون نقش مدرسه");
  });
});
