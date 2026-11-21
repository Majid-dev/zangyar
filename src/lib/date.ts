export function getSchoolBusinessDate(timezone: string, instant = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

const persianDateFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const persianMonthFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "UTC", year: "numeric", month: "long" });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formats a stored Gregorian `date` (YYYY-MM-DD) for display in the Persian
 * calendar. Storage stays Gregorian; only presentation changes. Anything that is
 * not a stored date is returned untouched so callers cannot render "Invalid Date".
 */
export function formatPersianDate(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  if (!ISO_DATE.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return persianDateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatPersianMonth(value: string | null | undefined, fallback = "—") {
  if (!value || !ISO_DATE.test(value)) return fallback;
  const [year, month, day] = value.split("-").map(Number);
  return persianMonthFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

/** Short numeric form such as ۱۴۰۵/۰۸/۳۰ for compact table cells. */
export function formatPersianDateShort(value: string | null | undefined, fallback = "—") {
  if (!value || !ISO_DATE.test(value)) return fallback;
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}
