import { describe, expect, it } from "vitest";

import { isValidIranianMobile, maskMobile, normalizeMobile, normalizeNationalId, toAsciiDigits } from "./normalization";

describe("student normalization", () => {
  it("converts Persian and Arabic digits", () => expect(toAsciiDigits("۱۲۳٤۵")).toBe("12345"));
  it("normalizes Iranian mobile variants", () => {
    expect(normalizeMobile("+98 912-123-4567")).toBe("09121234567");
    expect(normalizeMobile("989121234567")).toBe("09121234567");
    expect(normalizeMobile("۰۹۱۲۱۲۳۴۵۶۷")).toBe("09121234567");
  });
  it("normalizes optional IDs and masks contact output", () => {
    expect(normalizeNationalId("۱۲۳۴۵۶۷۸۹۰")).toBe("1234567890");
    expect(normalizeNationalId(" ")).toBeNull();
    expect(maskMobile("09121234567")).toBe("0912***567");
  });
  it("validates normalized mobile", () => {
    expect(isValidIranianMobile("09121234567")).toBe(true);
    expect(isValidIranianMobile("0912123")).toBe(false);
  });
});
