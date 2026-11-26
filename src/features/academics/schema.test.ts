import { describe, expect, it } from "vitest";

import { createAcademicYearSchema, createClassroomSchema } from "./schema";

describe("academic management schemas", () => {
  it("rejects a reversed academic-year range", () => {
    expect(() => createAcademicYearSchema.parse({
      code: "1405",
      name: "سال تحصیلی ۱۴۰۵",
      startDate: "2026-09-23",
      endDate: "2026-09-22",
    })).toThrow();
  });

  it("rejects invalid classroom capacity", () => {
    expect(() => createClassroomSchema.parse({
      academicYearId: "11111111-1111-4111-8111-111111111111",
      gradeId: "22222222-2222-4222-8222-222222222222",
      code: "A",
      name: "کلاس اول",
      capacity: 0,
    })).toThrow();
  });

  it("accepts a classroom without a teacher, since a class names none of its own", () => {
    const parsed = createClassroomSchema.parse({
      academicYearId: "11111111-1111-4111-8111-111111111111",
      gradeId: "22222222-2222-4222-8222-222222222222",
      code: "A",
      name: "کلاس اول",
    });
    expect(parsed).toMatchObject({ code: "A", name: "کلاس اول" });
  });
});
