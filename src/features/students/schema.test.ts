import { describe, expect, it } from "vitest";

import { createEnrollmentSchema, createGuardianSchema, createStudentSchema, linkGuardianSchema } from "./schema";

describe("student schemas", () => {
  it("normalizes student identifiers", () => {
    const student = createStudentSchema.parse({ admissionNumber: "  ۱۲۳  ", firstName: "آرین", lastName: "احمدی", nationalId: "۱۲۳۴۵۶۷۸۹۰" });
    expect(student.admissionNumber).toBe("123");
    expect(student.nationalId).toBe("1234567890");
  });
  it("rejects invalid guardian mobile", () => expect(() => createGuardianSchema.parse({ firstName: "مریم", lastName: "احمدی", normalizedMobile: "0912" })).toThrow());
  it("requires an enrollment end after its start", () => expect(() => createEnrollmentSchema.parse({ studentId: "11111111-1111-4111-8111-111111111111", academicYearId: "22222222-2222-4222-8222-222222222222", classroomId: "33333333-3333-4333-8333-333333333333", startDate: "2026-09-23", endDate: "2026-09-23" })).toThrow());
  it("requires a relationship type", () => expect(() => linkGuardianSchema.parse({ studentId: "11111111-1111-4111-8111-111111111111", guardianId: "22222222-2222-4222-8222-222222222222", relationshipType: "" })).toThrow());
});
