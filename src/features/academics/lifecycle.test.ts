import { describe, expect, it } from "vitest";

import { assertAcademicYearTransition, assertSchoolStatusTransition } from "./policy";
import { createAcademicYearSchema } from "./schema";

describe("academic lifecycle rules", () => {
  it("allows the supported academic-year lifecycle", () => {
    expect(() => assertAcademicYearTransition("DRAFT", "ACTIVE")).not.toThrow();
    expect(() => assertAcademicYearTransition("ACTIVE", "CLOSED")).not.toThrow();
    expect(() => assertAcademicYearTransition("CLOSED", "ARCHIVED")).not.toThrow();
  });

  it("rejects reopening a closed or archived academic year", () => {
    expect(() => assertAcademicYearTransition("CLOSED", "ACTIVE")).toThrow();
    expect(() => assertAcademicYearTransition("ARCHIVED", "DRAFT")).toThrow();
  });

  it("allows school suspension and reactivation, but not archived reactivation", () => {
    expect(() => assertSchoolStatusTransition("ACTIVE", "SUSPENDED")).not.toThrow();
    expect(() => assertSchoolStatusTransition("SUSPENDED", "ACTIVE")).not.toThrow();
    expect(() => assertSchoolStatusTransition("ARCHIVED", "ACTIVE")).toThrow();
  });

  it("rejects invalid academic-year dates", () => {
    expect(() => createAcademicYearSchema.parse({
      code: "1405",
      name: "سال تحصیلی",
      startDate: "2027-06-21",
      endDate: "2026-09-23",
    })).toThrow();
  });
});
