import { describe, expect, it } from "vitest";

import { createAcademicYearSchema } from "./schema";

describe("academic date validation", () => {
  it("rejects impossible calendar dates", () => {
    expect(() => createAcademicYearSchema.parse({
      code: "1405",
      name: "سال تحصیلی",
      startDate: "2026-02-31",
      endDate: "2027-06-21",
    })).toThrow();
  });
});
