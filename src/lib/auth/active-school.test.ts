import { describe, expect, it, vi } from "vitest";

// The module is server-only by design; the tests exercise the pure parser, which
// touches neither `cookies()` nor any request state.
vi.mock("server-only", () => ({}));

import { ACTIVE_SCHOOL_COOKIE, parseActiveSchoolPreference } from "./active-school";

const schoolId = "11111111-1111-4111-8111-111111111111";

describe("parseActiveSchoolPreference", () => {
  it("returns the stored school id", () => {
    expect(parseActiveSchoolPreference(`${ACTIVE_SCHOOL_COOKIE}=${schoolId}`)).toBe(schoolId);
  });

  it("finds the cookie among others, in any position", () => {
    expect(parseActiveSchoolPreference(`a=1; ${ACTIVE_SCHOOL_COOKIE}=${schoolId}; b=2`)).toBe(schoolId);
  });

  it("normalizes case, so a school id matches however it was written", () => {
    expect(parseActiveSchoolPreference(`${ACTIVE_SCHOOL_COOKIE}=${schoolId.toUpperCase()}`)).toBe(schoolId);
  });

  it("ignores a value that is not a uuid", () => {
    // A hand-edited cookie must never reach a query as arbitrary text.
    expect(parseActiveSchoolPreference(`${ACTIVE_SCHOOL_COOKIE}=school-b`)).toBeNull();
    expect(parseActiveSchoolPreference(`${ACTIVE_SCHOOL_COOKIE}='; drop table users--`)).toBeNull();
  });

  it("returns null for a malformed percent-escape rather than throwing", () => {
    expect(parseActiveSchoolPreference(`${ACTIVE_SCHOOL_COOKIE}=%E0%A4%A`)).toBeNull();
  });

  it("returns null when the cookie, the header, or the name is absent", () => {
    expect(parseActiveSchoolPreference(null)).toBeNull();
    expect(parseActiveSchoolPreference("")).toBeNull();
    expect(parseActiveSchoolPreference("other=1")).toBeNull();
  });

  it("does not match a cookie whose name merely ends with the same text", () => {
    expect(parseActiveSchoolPreference(`not-${ACTIVE_SCHOOL_COOKIE}=${schoolId}`)).toBeNull();
  });
});
