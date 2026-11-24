import { describe, expect, it } from "vitest";

import {
  isValidIranianMobile,
  maskIranianMobile,
  normalizeIranianMobile,
} from "./mobile";

describe("Iranian mobile normalization", () => {
  it("accepts the local 09 form", () => {
    expect(normalizeIranianMobile("09120000000")).toBe("09120000000");
  });

  it("accepts the +98 international form", () => {
    expect(normalizeIranianMobile("+98 912 000 0000")).toBe("09120000000");
    expect(normalizeIranianMobile("+989120000000")).toBe("09120000000");
  });

  it("accepts the 0098 international form", () => {
    expect(normalizeIranianMobile("00989120000000")).toBe("09120000000");
  });

  it("accepts the bare 9XXXXXXXXX form", () => {
    expect(normalizeIranianMobile("9120000000")).toBe("09120000000");
  });

  it("accepts the 98-prefixed form without plus", () => {
    expect(normalizeIranianMobile("989120000000")).toBe("09120000000");
  });

  it("converts Persian and Arabic digits", () => {
    expect(normalizeIranianMobile("۰۹۱۲۰۰۰۰۰۰۰")).toBe("09120000000");
    expect(normalizeIranianMobile("٠٩١٢٠٠٠٠٠٠٠")).toBe("09120000000");
  });

  it("strips separators and parentheses", () => {
    expect(normalizeIranianMobile("(0912) 000-0000")).toBe("09120000000");
  });

  it("returns null for empty input", () => {
    expect(normalizeIranianMobile(null)).toBeNull();
    expect(normalizeIranianMobile("")).toBeNull();
    expect(normalizeIranianMobile("   ")).toBeNull();
  });

  it("validates only canonical Iranian mobile numbers", () => {
    expect(isValidIranianMobile("09120000000")).toBe(true);
    expect(isValidIranianMobile("08120000000")).toBe(false);
    expect(isValidIranianMobile("0912000000")).toBe(false);
    expect(isValidIranianMobile("091200000000")).toBe(false);
    expect(isValidIranianMobile(null)).toBe(true);
  });

  it("validates normalized output of every accepted spelling", () => {
    for (const spelling of [
      "09120000000",
      "+98 912 000 0000",
      "00989120000000",
      "9120000000",
      "۰۹۱۲۰۰۰۰۰۰۰",
    ]) {
      expect(isValidIranianMobile(normalizeIranianMobile(spelling))).toBe(true);
    }
  });

  it("masks a mobile number for display", () => {
    expect(maskIranianMobile("09120000000")).toBe("0912***000");
    expect(maskIranianMobile(null)).toBeNull();
  });
});
