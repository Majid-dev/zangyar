import { describe, expect, it } from "vitest";

import {
  addJalaliMonths,
  formatJalaliDate,
  formatStoredDate,
  isoToJalali,
  isJalaliLeapYear,
  jalaliMonthDays,
  jalaliToIso,
  jalaliWeekdayIndex,
  parseJalaliInput,
  toLatinDigits,
  toPersianDigits,
} from "./jalali";
import { isoDateSchema } from "./date-schema";

describe("isoToJalali / jalaliToIso", () => {
  it("converts a known Gregorian date to Jalali", () => {
    expect(isoToJalali("2026-11-21")).toEqual({ jy: 1405, jm: 8, jd: 30 });
    expect(isoToJalali("2016-04-11")).toEqual({ jy: 1395, jm: 1, jd: 23 });
  });

  it("round-trips every day of a Jalali year without drift", () => {
    for (let jm = 1; jm <= 12; jm += 1) {
      for (let jd = 1; jd <= jalaliMonthDays(1405, jm); jd += 1) {
        const iso = jalaliToIso(1405, jm, jd);
        expect(iso).not.toBeNull();
        expect(isoToJalali(iso)).toEqual({ jy: 1405, jm, jd });
      }
    }
  });

  it("rejects impossible Jalali dates", () => {
    expect(jalaliToIso(1405, 12, 30)).toBeNull();
    expect(jalaliToIso(1405, 13, 1)).toBeNull();
    expect(jalaliToIso(1405, 7, 31)).toBeNull();
  });

  it("returns null for unusable input instead of throwing", () => {
    expect(isoToJalali(null)).toBeNull();
    expect(isoToJalali("")).toBeNull();
    expect(isoToJalali("21/11/2026")).toBeNull();
    expect(isoToJalali("2026-02-31")).toBeNull();
  });
});

describe("Nowruz and leap-year boundaries", () => {
  it("places Nowruz on 1 Farvardin", () => {
    expect(isoToJalali("2026-03-21")).toEqual({ jy: 1405, jm: 1, jd: 1 });
    expect(isoToJalali("2025-03-21")).toEqual({ jy: 1404, jm: 1, jd: 1 });
  });

  it("keeps the last day of the previous year before Nowruz", () => {
    expect(isoToJalali("2026-03-20")).toEqual({ jy: 1404, jm: 12, jd: 29 });
  });

  it("handles a leap Jalali year's 30 Esfand", () => {
    expect(isJalaliLeapYear(1403)).toBe(true);
    expect(jalaliMonthDays(1403, 12)).toBe(30);
    expect(jalaliToIso(1403, 12, 30)).toBe("2025-03-20");
    expect(isoToJalali("2025-03-20")).toEqual({ jy: 1403, jm: 12, jd: 30 });

    expect(isJalaliLeapYear(1404)).toBe(false);
    expect(jalaliMonthDays(1404, 12)).toBe(29);
  });

  it("knows the first six months have 31 days and the next five have 30", () => {
    for (let jm = 1; jm <= 6; jm += 1) expect(jalaliMonthDays(1405, jm)).toBe(31);
    for (let jm = 7; jm <= 11; jm += 1) expect(jalaliMonthDays(1405, jm)).toBe(30);
  });
});

describe("month arithmetic", () => {
  it("rolls forward across a year boundary", () => {
    expect(addJalaliMonths({ jy: 1405, jm: 12, jd: 10 }, 1)).toEqual({ jy: 1406, jm: 1, jd: 10 });
  });

  it("rolls backward across a year boundary", () => {
    expect(addJalaliMonths({ jy: 1405, jm: 1, jd: 10 }, -1)).toEqual({ jy: 1404, jm: 12, jd: 10 });
  });

  it("clamps the day to the target month length", () => {
    // 31 Farvardin + 1 month -> Esfand, which is shorter in a common year.
    expect(addJalaliMonths({ jy: 1404, jm: 6, jd: 31 }, 6)).toEqual({ jy: 1404, jm: 12, jd: 29 });
  });

  it("handles multi-year jumps", () => {
    expect(addJalaliMonths({ jy: 1405, jm: 5, jd: 15 }, 25)).toEqual({ jy: 1407, jm: 6, jd: 15 });
  });
});

describe("weekday indexing", () => {
  it("starts weeks on Saturday", () => {
    // 2026-11-21 is a Saturday.
    expect(jalaliWeekdayIndex("2026-11-21")).toBe(0);
    // 2026-11-27 is a Friday.
    expect(jalaliWeekdayIndex("2026-11-27")).toBe(6);
  });

  it("is independent of the runtime timezone", () => {
    expect(jalaliWeekdayIndex("2026-03-21")).toBe(jalaliWeekdayIndex("2026-03-21"));
  });
});

describe("digit handling", () => {
  it("converts between Persian and Latin digits", () => {
    expect(toPersianDigits(1405)).toBe("۱۴۰۵");
    expect(toLatinDigits("۱۴۰۵/۰۸/۳۰")).toBe("1405/08/30");
    expect(toLatinDigits("١٤٠٥")).toBe("1405");
  });
});

describe("formatting", () => {
  it("renders Persian month names", () => {
    expect(formatJalaliDate({ jy: 1405, jm: 1, jd: 1 }, "long")).toBe("۱ فروردین ۱۴۰۵");
    expect(formatJalaliDate({ jy: 1405, jm: 12, jd: 29 }, "long")).toBe("۲۹ اسفند ۱۴۰۵");
    expect(formatJalaliDate({ jy: 1405, jm: 8, jd: 30 }, "numeric")).toBe("۱۴۰۵/۰۸/۳۰");
    expect(formatJalaliDate({ jy: 1405, jm: 8, jd: 30 }, "medium")).toBe("۳۰ آبان");
  });

  it("formats a stored Gregorian value in Jalali", () => {
    expect(formatStoredDate("2026-11-21")).toBe("۳۰ آبان ۱۴۰۵");
  });

  it("falls back for null and passes non-date labels through", () => {
    expect(formatStoredDate(null)).toBe("—");
    expect(formatStoredDate(null, "long", "ثبت نشده")).toBe("ثبت نشده");
    expect(formatStoredDate("اکنون")).toBe("اکنون");
    expect(formatStoredDate("2026-02-31")).toBe("—");
  });
});

describe("parseJalaliInput", () => {
  it("accepts Persian digits with slashes", () => {
    expect(parseJalaliInput("۱۴۰۵/۰۸/۳۰")).toEqual({ iso: "2026-11-21" });
  });

  it("accepts Latin digits and alternative separators", () => {
    expect(parseJalaliInput("1405/8/30")).toEqual({ iso: "2026-11-21" });
    expect(parseJalaliInput("1405-08-30")).toEqual({ iso: "2026-11-21" });
    expect(parseJalaliInput(" ۱۴۰۵.۰۸.۳۰ ")).toEqual({ iso: "2026-11-21" });
  });

  it("rejects an out-of-range day for the month", () => {
    const result = parseJalaliInput("1405/07/31");
    expect(result).toHaveProperty("error");
  });

  it("rejects 30 Esfand in a common year but accepts it in a leap year", () => {
    expect(parseJalaliInput("1404/12/30")).toHaveProperty("error");
    expect(parseJalaliInput("1403/12/30")).toEqual({ iso: "2025-03-20" });
  });

  it("rejects malformed and out-of-range input", () => {
    expect(parseJalaliInput("")).toHaveProperty("error");
    expect(parseJalaliInput("abc")).toHaveProperty("error");
    expect(parseJalaliInput("1405/13/01")).toHaveProperty("error");
    expect(parseJalaliInput("1000/01/01")).toHaveProperty("error");
  });
});

describe("isoDateSchema", () => {
  it("accepts real Gregorian dates", () => {
    expect(isoDateSchema.parse("2026-11-21")).toBe("2026-11-21");
    expect(isoDateSchema.parse("2024-02-29")).toBe("2024-02-29");
  });

  it("rejects impossible or wrongly formatted dates", () => {
    expect(() => isoDateSchema.parse("2026-02-31")).toThrow();
    expect(() => isoDateSchema.parse("2023-02-29")).toThrow();
    expect(() => isoDateSchema.parse("1405/08/30")).toThrow();
    expect(() => isoDateSchema.parse("2026-11-21T00:00:00Z")).toThrow();
  });
});
