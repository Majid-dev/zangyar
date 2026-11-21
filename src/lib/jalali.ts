import { toGregorian, toJalaali, isValidJalaaliDate, jalaaliMonthLength, isLeapJalaaliYear } from "jalaali-js";

/**
 * Persian (Jalali) calendar boundary.
 *
 * Storage and every server contract stay Gregorian ISO `YYYY-MM-DD` (PostgreSQL
 * `date`). Jalali exists only at the presentation and input edges, and all
 * conversion goes through jalaali-js (Borkowski algorithm) rather than a
 * hand-rolled algorithm, so display and input can never disagree.
 *
 * All arithmetic here is done on plain year/month/day numbers via Date.UTC, never
 * on local-time Date construction, so a date-only value can never shift a day.
 */

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/** Jalaali weeks start on Saturday. */
export const JALALI_WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"] as const;

export const JALALI_WEEKDAYS_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"] as const;

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type JalaliDate = { jy: number; jm: number; jd: number };

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toPersianDigits(value: string | number) {
  return String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

export function toLatinDigits(value: string) {
  return [...value]
    .map((character) => {
      const persianIndex = PERSIAN_DIGITS.indexOf(character);
      if (persianIndex >= 0) return String(persianIndex);
      const arabicIndex = ARABIC_DIGITS.indexOf(character);
      return arabicIndex >= 0 ? String(arabicIndex) : character;
    })
    .join("");
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Gregorian ISO `YYYY-MM-DD` -> `{ jy, jm, jd }`. Returns null for unusable input. */
export function isoToJalali(iso: string | null | undefined): JalaliDate | null {
  if (!iso || !ISO_DATE_PATTERN.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (!isValidGregorianDate(year, month, day)) return null;
  try {
    const { jy, jm, jd } = toJalaali(year, month, day);
    return { jy, jm, jd };
  } catch {
    // Outside the documented Jalaali range (-61 … 3177).
    return null;
  }
}

/** `{ jy, jm, jd }` -> Gregorian ISO `YYYY-MM-DD`. Returns null if the date is not real. */
export function jalaliToIso(jy: number, jm: number, jd: number): string | null {
  if (!isValidJalaaliDate(jy, jm, jd)) return null;
  try {
    const { gy, gm, gd } = toGregorian(jy, jm, jd);
    return `${gy}-${pad(gm)}-${pad(gd)}`;
  } catch {
    return null;
  }
}

export function isValidGregorianDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function jalaliMonthDays(jy: number, jm: number) {
  return jalaaliMonthLength(jy, jm);
}

export function isJalaliLeapYear(jy: number) {
  try {
    return isLeapJalaaliYear(jy);
  } catch {
    return false;
  }
}

/** Saturday-first day-of-week index (0 = شنبه … 6 = جمعه) for a Gregorian ISO date. */
export function jalaliWeekdayIndex(iso: string) {
  if (!ISO_DATE_PATTERN.test(iso)) return 0;
  const [year, month, day] = iso.split("-").map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (utcDay + 1) % 7;
}

/**
 * The current business date as Gregorian ISO, resolved in a timezone.
 * Mirrors `getSchoolBusinessDate` in `@/lib/date` for client-side use.
 */
export function todayIso(timezone = "Asia/Tehran", instant = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/**
 * Adds a number of Jalali months, clamping the day to the target month length
 * so ۳۱ فروردین + ۱ ماه becomes ۳۱ اردیبهشت rather than overflowing.
 */
export function addJalaliMonths({ jy, jm, jd }: JalaliDate, delta: number): JalaliDate {
  const zeroBased = jy * 12 + (jm - 1) + delta;
  const nextJy = Math.floor(zeroBased / 12);
  const nextJm = (zeroBased % 12) + 1;
  const length = jalaliMonthDays(nextJy, nextJm);
  return { jy: nextJy, jm: nextJm, jd: Math.min(jd, length) };
}

export type JalaliFormat = "long" | "medium" | "short" | "numeric";

function formatParts({ jy, jm, jd }: JalaliDate) {
  return { year: toPersianDigits(jy), month: JALALI_MONTHS[jm - 1] ?? "", day: toPersianDigits(jd) };
}

/** Renders a Jalali date. Storage stays Gregorian; this is display only. */
export function formatJalaliMonth(value: JalaliDate) {
  const { year, month } = formatParts(value);
  return `${month} ${year}`;
}

export function formatJalaliDate(value: JalaliDate, style: JalaliFormat = "long") {
  const { year, month, day } = formatParts(value);
  switch (style) {
    case "long":
      return `${day} ${month} ${year}`;
    case "medium":
      return `${day} ${month}`;
    case "short":
      return `${day}/${toPersianDigits(value.jm)}/${year}`;
    case "numeric":
      return toPersianDigits(`${value.jy}/${pad(value.jm)}/${pad(value.jd)}`);
  }
}

export type ParsedJalaliInput = { iso: string } | { error: string };

/**
 * Parses a user-typed Jalali date. Accepts Persian or Latin digits with `/`, `-`,
 * `.` or whitespace separators, e.g. `۱۴۰۵/۰۸/۳۰`, `1405-8-30`.
 * Returns a Gregorian ISO value so callers never store a Jalali string.
 */
export function parseJalaliInput(text: string): ParsedJalaliInput {
  const normalized = toLatinDigits(text.trim()).replace(/[.\s-]+/g, "/").replace(/\/+/g, "/");
  const match = /^(\d{1,4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized);

  if (!match) return { error: "تاریخ را به شکل ۱۴۰۵/۰۸/۳۰ وارد کنید." };

  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);

  if (jy < 1200 || jy > 1700) return { error: "سال شمسی خارج از محدوده‌ی مجاز است." };
  if (jm < 1 || jm > 12) return { error: "ماه باید بین ۱ تا ۱۲ باشد." };

  const length = jalaliMonthDays(jy, jm);
  if (jd < 1 || jd > length) return { error: `این ماه ${toPersianDigits(length)} روز دارد.` };

  const iso = jalaliToIso(jy, jm, jd);
  if (!iso) return { error: "این تاریخ در تقویم شمسی وجود ندارد." };

  return { iso };
}

/** Formats a stored Gregorian ISO date as Jalali. Non-ISO input is passed through untouched. */
export function formatStoredDate(iso: string | null | undefined, style: JalaliFormat = "long", fallback = "—") {
  if (!iso) return fallback;
  const jalali = isoToJalali(iso);
  if (!jalali) return ISO_DATE_PATTERN.test(iso) ? fallback : iso;
  return formatJalaliDate(jalali, style);
}
