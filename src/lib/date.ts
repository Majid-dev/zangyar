import { formatJalaliMonth, formatStoredDate, isoToJalali, type JalaliFormat } from "./jalali";

export function getSchoolBusinessDate(timezone: string, instant = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/**
 * Display helpers for stored Gregorian `date` values (YYYY-MM-DD).
 * All of these render in the Persian calendar through `@/lib/jalali`; storage and
 * every server-side contract remain Gregorian, so no formatted Persian string is
 * ever persisted and no date-only value is shifted by a timezone.
 */
export function formatPersianDate(value: string | null | undefined, fallback = "—") {
  return formatStoredDate(value, "long", fallback);
}

export function formatPersianDateMedium(value: string | null | undefined, fallback = "—") {
  return formatStoredDate(value, "medium", fallback);
}

/** Compact numeric form such as ۱۴۰۵/۰۸/۳۰ for table cells. */
export function formatPersianDateShort(value: string | null | undefined, fallback = "—") {
  return formatStoredDate(value, "numeric", fallback);
}

/** Month label such as «آذر ۱۴۰۵» for range captions. */
export function formatPersianMonth(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  const jalali = isoToJalali(value);
  return jalali ? formatJalaliMonth(jalali) : value;
}

export function formatStoredDateAs(value: string | null | undefined, style: JalaliFormat, fallback = "—") {
  return formatStoredDate(value, style, fallback);
}
