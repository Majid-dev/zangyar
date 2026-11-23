import { toAsciiDigits } from "@/lib/digits";

function cleanIdentifier(value: string) {
  return toAsciiDigits(value).trim().replace(/[\s-]/g, "");
}

export { toAsciiDigits };

export function normalizeAdmissionNumber(value: string) {
  return cleanIdentifier(value);
}

export function normalizeNationalId(value: string | null | undefined) {
  const normalized = value == null ? "" : cleanIdentifier(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeMobile(value: string | null | undefined) {
  const normalized = value == null ? "" : cleanIdentifier(value).replace(/[()]/g, "");
  if (normalized.length === 0) return null;
  const withoutPlus = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  if (withoutPlus.startsWith("0098")) return `0${withoutPlus.slice(4)}`;
  if (withoutPlus.startsWith("98")) return `0${withoutPlus.slice(2)}`;
  if (normalized.startsWith("9") && normalized.length === 10) return `0${normalized}`;
  return normalized;
}

export function maskMobile(value: string | null | undefined) {
  if (!value) return null;
  return value.length >= 7 ? `${value.slice(0, 4)}***${value.slice(-3)}` : "***";
}

export function isValidIranianMobile(value: string | null | undefined) {
  return value == null || /^09\d{9}$/.test(value);
}

export function isValidNationalId(value: string | null | undefined) {
  return value == null || /^\d{10}$/.test(value);
}
