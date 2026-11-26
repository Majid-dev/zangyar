import { formatJalaliMonth, formatStoredDate, isoToJalali, type JalaliFormat } from "./jalali";

export function getSchoolBusinessDate(timezone: string, instant = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/**
 * The offset of a timezone at a given instant, in milliseconds.
 *
 * `Intl` can render an instant as wall-clock fields in a zone but cannot go the
 * other way, so the offset is recovered by formatting the instant in the zone and
 * reading those fields back as if they were UTC: the difference between that and
 * the true instant is the offset.
 */
function timeZoneOffsetMs(timezone: string, instant: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instant).map((part) => [part.type, part.value]),
  );
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - instant.getTime();
}

/**
 * Resolve a school-local date and wall-clock time to an absolute instant.
 *
 * A timetable says a period ends at 09:30, which is a school-local statement, not
 * a UTC one; a submission deadline derived from it has to be stored as a real
 * instant. Applying the zone's offset to the wall-clock fields is the inverse of
 * `getSchoolBusinessDate`, and the correction is applied twice because the offset
 * itself can differ between the naive guess and the answer it produces.
 */
export function schoolLocalDateTimeToInstant(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstPass = wallClockAsUtc - timeZoneOffsetMs(timezone, new Date(wallClockAsUtc));
  const secondPass = wallClockAsUtc - timeZoneOffsetMs(timezone, new Date(firstPass));
  return new Date(secondPass);
}

export function addMinutes(instant: Date, minutes: number) {
  return new Date(instant.getTime() + minutes * 60_000);
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
