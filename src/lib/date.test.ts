import { describe, expect, it } from "vitest";

import { addMinutes, formatPersianDate, formatPersianDateShort, formatPersianMonth, getSchoolBusinessDate, schoolLocalDateTimeToInstant } from "./date";

describe("getSchoolBusinessDate", () => {
  it("resolves the business date in the school timezone", () => {
    const instant = new Date("2026-11-20T21:30:00Z");
    expect(getSchoolBusinessDate("Asia/Tehran", instant)).toBe("2026-11-21");
    expect(getSchoolBusinessDate("UTC", instant)).toBe("2026-11-20");
  });
});

describe("schoolLocalDateTimeToInstant", () => {
  it("resolves a school-local wall clock to the instant it names", () => {
    // Tehran is UTC+03:30 in the autumn, so a 09:30 local period end is 06:00Z.
    expect(schoolLocalDateTimeToInstant("2026-11-21", "09:30", "Asia/Tehran").toISOString()).toBe("2026-11-21T06:00:00.000Z");
  });

  it("round-trips back to the same school-local date", () => {
    const instant = schoolLocalDateTimeToInstant("2026-11-21", "13:15", "Asia/Tehran");
    expect(getSchoolBusinessDate("Asia/Tehran", instant)).toBe("2026-11-21");
  });

  it("uses the offset in effect on the named date rather than today's", () => {
    // Iran stopped observing daylight saving in 2022, so both of these are
    // UTC+03:30; the assertion is that the offset is read per date, not cached.
    const summer = schoolLocalDateTimeToInstant("2026-07-01", "08:00", "Asia/Tehran");
    const winter = schoolLocalDateTimeToInstant("2026-12-01", "08:00", "Asia/Tehran");
    expect(summer.toISOString()).toBe("2026-07-01T04:30:00.000Z");
    expect(winter.toISOString()).toBe("2026-12-01T04:30:00.000Z");
  });

  it("adds a submission window without crossing the day boundary incorrectly", () => {
    const deadline = addMinutes(schoolLocalDateTimeToInstant("2026-11-21", "23:30", "Asia/Tehran"), 45);
    expect(deadline.toISOString()).toBe("2026-11-21T20:45:00.000Z");
    expect(getSchoolBusinessDate("Asia/Tehran", deadline)).toBe("2026-11-22");
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
