import { describe, expect, it } from "vitest";

import { assignTeacherSchema, createAcademicYearSchema, createClassroomSchema } from "./schema";

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

  it("rejects an assignment with an end before its start", () => {
    expect(() => assignTeacherSchema.parse({
      classroomId: "11111111-1111-4111-8111-111111111111",
      teacherMembershipId: "22222222-2222-4222-8222-222222222222",
      startDate: "2026-09-23",
      endDate: "2026-09-22",
      isPrimary: false,
    })).toThrow();
  });
});
