import { describe, expect, it } from "vitest";

import { formatPersianDate, formatPersianDateShort, formatPersianMonth, getSchoolBusinessDate } from "./date";

describe("getSchoolBusinessDate", () => {
  it("resolves the business date in the school timezone", () => {
    const instant = new Date("2026-11-20T21:30:00Z");
    expect(getSchoolBusinessDate("Asia/Tehran", instant)).toBe("2026-11-21");
    expect(getSchoolBusinessDate("UTC", instant)).toBe("2026-11-20");
  });
});

describe("formatPersianDate", () => {
  it("renders a stored Gregorian date in the Persian calendar", () => {
    const formatted = formatPersianDate("2026-11-21");
    expect(formatted).toContain("۱۴۰۵");
    expect(formatted).toContain("آبان");
    expect(formatPersianDateShort("2026-11-21")).toBe("۱۴۰۵/۰۸/۳۰");
  });

  it("is stable across the whole stored day regardless of runtime timezone", () => {
    expect(formatPersianDate("2026-03-21")).toBe(formatPersianDate("2026-03-21"));
    expect(formatPersianDateShort("2026-03-21")).toMatch(/۱۴۰۵/);
  });

  it("renders the Persian new year boundary correctly", () => {
    expect(formatPersianDate("2026-03-20")).toContain("۱۴۰۴");
    expect(formatPersianDate("2026-03-21")).toContain("۱۴۰۵");
  });

  it("falls back for null, empty, and non-date values", () => {
    expect(formatPersianDate(null)).toBe("—");
    expect(formatPersianDate(undefined)).toBe("—");
    expect(formatPersianDate("")).toBe("—");
    expect(formatPersianDate(null, "ثبت نشده")).toBe("ثبت نشده");
    expect(formatPersianDate("اکنون")).toBe("اکنون");
  });

  it("formats months for range labels", () => {
    expect(formatPersianMonth("2026-11-21")).toContain("آبان");
    expect(formatPersianMonth(null)).toBe("—");
  });
});
