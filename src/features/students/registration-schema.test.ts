import { describe, expect, it } from "vitest";

import { createAndLinkGuardianSchema, createGuardianSchema, registerStudentSchema, studentListFilterSchema } from "./schema";

const uuidA = "11111111-1111-4111-8111-111111111111";
const uuidB = "22222222-2222-4222-8222-222222222222";

function registration(overrides: Partial<Parameters<typeof registerStudentSchema.parse>[0]> = {}) {
  return {
    student: { admissionNumber: " ۱۲۳ ", firstName: "آرین", lastName: "احمدی", nationalId: null, birthDate: null },
    guardians: [],
    enrollment: null,
    ...overrides,
  };
}

describe("guardian email", () => {
  it("normalizes case and trims the address", () => {
    const guardian = createGuardianSchema.parse({ firstName: "مریم", lastName: "احمدی", normalizedMobile: "۰۹۱۲۳۴۵۶۷۸۹", email: "  Maryam@Example.COM " });
    expect(guardian.email).toBe("maryam@example.com");
    expect(guardian.normalizedMobile).toBe("09123456789");
  });

  it("treats an empty string as no email", () => {
    expect(createGuardianSchema.parse({ firstName: "م", lastName: "ا", normalizedMobile: null, email: "   " }).email).toBeNull();
  });

  it("rejects a malformed address", () => {
    expect(() => createGuardianSchema.parse({ firstName: "م", lastName: "ا", normalizedMobile: null, email: "not-an-email" })).toThrow();
  });

  it("stays optional", () => {
    expect(createGuardianSchema.parse({ firstName: "م", lastName: "ا", normalizedMobile: null }).email).toBeUndefined();
  });
});

describe("registerStudentSchema", () => {
  it("accepts a profile on its own", () => {
    const parsed = registerStudentSchema.parse(registration());
    expect(parsed.guardians).toEqual([]);
    expect(parsed.enrollment).toBeNull();
  });

  it("accepts multiple guardians", () => {
    const parsed = registerStudentSchema.parse(registration({
      guardians: [
        { firstName: "مریم", lastName: "احمدی", normalizedMobile: "09120000001", relationshipType: "مادر", isPrimary: true, receivesSms: true, isEmergency: false },
        { firstName: "حسن", lastName: "احمدی", normalizedMobile: "09120000002", relationshipType: "پدر", isPrimary: false, receivesSms: true, isEmergency: true },
      ],
    }));
    expect(parsed.guardians).toHaveLength(2);
  });

  it("rejects more than one primary guardian", () => {
    const result = registerStudentSchema.safeParse(registration({
      guardians: [
        { firstName: "م", lastName: "ا", normalizedMobile: "09120000001", relationshipType: "مادر", isPrimary: true, receivesSms: true, isEmergency: false },
        { firstName: "ح", lastName: "ا", normalizedMobile: "09120000002", relationshipType: "پدر", isPrimary: true, receivesSms: true, isEmergency: false },
      ],
    }));
    expect(result.success).toBe(false);
  });

  it("requires a mobile when SMS delivery is requested", () => {
    const result = registerStudentSchema.safeParse(registration({
      guardians: [{ firstName: "م", lastName: "ا", normalizedMobile: null, relationshipType: "مادر", isPrimary: true, receivesSms: true, isEmergency: false }],
    }));
    expect(result.success).toBe(false);
  });

  it("allows a guardian without a mobile when SMS is not requested", () => {
    const parsed = registerStudentSchema.parse(registration({
      guardians: [{ firstName: "م", lastName: "ا", normalizedMobile: null, relationshipType: "سرپرست", isPrimary: true, receivesSms: false, isEmergency: false }],
    }));
    expect(parsed.guardians[0].normalizedMobile).toBeNull();
  });

  it("accepts an enrollment alongside the profile", () => {
    const parsed = registerStudentSchema.parse(registration({ enrollment: { academicYearId: uuidA, classroomId: uuidB, startDate: "2026-09-23", endDate: null } }));
    expect(parsed.enrollment?.classroomId).toBe(uuidB);
  });

  it("rejects an enrollment whose end precedes its start", () => {
    const result = registerStudentSchema.safeParse(registration({ enrollment: { academicYearId: uuidA, classroomId: uuidB, startDate: "2026-09-23", endDate: "2026-09-22" } }));
    expect(result.success).toBe(false);
  });

  it("rejects an impossible birth date", () => {
    expect(registerStudentSchema.safeParse(registration({ student: { admissionNumber: "1", firstName: "آ", lastName: "ا", nationalId: null, birthDate: "2026-02-31" } })).success).toBe(false);
  });

  it("rejects an implausibly long guardian list", () => {
    const guardian = { firstName: "م", lastName: "ا", normalizedMobile: "09120000001", relationshipType: "مادر", isPrimary: false, receivesSms: true, isEmergency: false };
    expect(registerStudentSchema.safeParse(registration({ guardians: Array.from({ length: 7 }, () => guardian) })).success).toBe(false);
  });
});

describe("createAndLinkGuardianSchema", () => {
  it("requires a relationship type", () => {
    expect(() => createAndLinkGuardianSchema.parse({ studentId: uuidA, firstName: "م", lastName: "ا", normalizedMobile: null, relationshipType: "" })).toThrow();
  });

  it("accepts a valid link payload", () => {
    const parsed = createAndLinkGuardianSchema.parse({ studentId: uuidA, firstName: "م", lastName: "ا", normalizedMobile: "09120000001", relationshipType: "مادر", isPrimary: true, receivesSms: true, isEmergency: false });
    expect(parsed).toMatchObject({ studentId: uuidA, isPrimary: true, receivesSms: true });
  });

  it("still accepts a preset relationship and a custom one", () => {
    const base = { studentId: uuidA, firstName: "م", lastName: "ا", normalizedMobile: "09120000001", isPrimary: false, receivesSms: true, isEmergency: false };
    expect(createAndLinkGuardianSchema.parse({ ...base, relationshipType: "سرپرست قانونی" }).relationshipType).toBe("سرپرست قانونی");
    expect(createAndLinkGuardianSchema.parse({ ...base, relationshipType: "قیم شرعی" }).relationshipType).toBe("قیم شرعی");
  });

  it("does not invalidate a relationship saved before the preset list existed", () => {
    const parsed = registerStudentSchema.parse(registration({
      guardians: [{ firstName: "م", lastName: "ا", normalizedMobile: "09120000001", relationshipType: "قیم", isPrimary: true, receivesSms: true, isEmergency: false }],
    }));
    expect(parsed.guardians[0].relationshipType).toBe("قیم");
  });
});

describe("studentListFilterSchema", () => {
  it("parses the unenrolled flag from a query string", () => {
    const parsed = studentListFilterSchema.parse({ unenrolled: "true" });
    expect(parsed.unenrolled).toBe(true);
  });

  it("defaults the unenrolled flag to false", () => {
    expect(studentListFilterSchema.parse({}).unenrolled).toBe(false);
  });

  it("accepts each supported sort field and defaults to name ascending", () => {
    for (const sort of ["name", "admission", "classroom", "guardian", "status"]) {
      expect(studentListFilterSchema.parse({ sort, dir: "desc" })).toMatchObject({ sort, dir: "desc" });
    }
    expect(studentListFilterSchema.parse({})).toMatchObject({ sort: "name", dir: "asc" });
  });

  it("rejects an unknown sort field instead of passing it to SQL", () => {
    expect(studentListFilterSchema.safeParse({ sort: "students.password" }).success).toBe(false);
  });

  it("keeps the per-column filters independent", () => {
    const parsed = studentListFilterSchema.parse({ name: " آرین ", admission: "12", guardian: "احمدی" });
    expect(parsed).toMatchObject({ name: "آرین", admission: "12", guardian: "احمدی" });
  });
});
