import { z } from "zod";

import { isValidGregorianDate, ISO_DATE_PATTERN } from "./jalali";

/**
 * Shared date-only contract.
 *
 * The value crossing every boundary — form data, Server Action input, query
 * filter, database column — is Gregorian ISO `YYYY-MM-DD`. Jalali exists only in
 * the UI, where `JalaliDatePicker` converts to this shape before submitting.
 * Calendar arithmetic uses Date.UTC so a date-only value can never shift a day.
 */
export const isoDateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN, "تاریخ باید به شکل YYYY-MM-DD باشد.")
  .superRefine((value, context) => {
    const [year, month, day] = value.split("-").map(Number);
    if (!isValidGregorianDate(year, month, day)) {
      context.addIssue({ code: "custom", message: "این تاریخ وجود ندارد." });
    }
  });

export const optionalIsoDateSchema = isoDateSchema.nullable().optional().default(null);

export const isoDateRangeSchema = z
  .object({ startDate: isoDateSchema, endDate: isoDateSchema.nullable().optional().default(null) })
  .superRefine((value, context) => {
    if (value.endDate && value.startDate >= value.endDate) {
      context.addIssue({ code: "custom", path: ["endDate"], message: "تاریخ پایان باید بعد از تاریخ شروع باشد." });
    }
  });
