import { describe, expect, it } from "vitest";

import { createTeacherSchema, teacherListFilterSchema, updateTeacherSchema } from "./schema";

describe("createTeacherSchema", () => {
  it("normalizes every accepted Iranian mobile spelling to one canonical form", () => {
    const spellings = ["09123456789", "+989123456789", "00989123456789", "9123456789", "۰۹۱۲۳۴۵۶۷۸۹", "٠٩١٢٣٤٥٦٧٨٩", "0912 345 6789", "0912-345-6789", "(0912) 3456789"];

    for (const mobile of spellings) {
      const parsed = createTeacherSchema.parse({ firstName: "زهرا", lastName: "محمدی", mobile });
      expect(parsed.mobile).toBe("09123456789");
    }
  });

  it("rejects a number that is not an Iranian mobile", () => {
    for (const mobile of ["0812345678", "08123456789", "0912345678", "091234567890", "02123456789", "not-a-number"]) {
      expect(createTeacherSchema.safeParse({ firstName: "زهرا", lastName: "محمدی", mobile }).success).toBe(false);
    }
  });

  it("treats the personnel code as optional", () => {
    expect(createTeacherSchema.parse({ firstName: "a", lastName: "b", mobile: "09123456789" }).personnelCode).toBeNull();
    expect(createTeacherSchema.parse({ firstName: "a", lastName: "b", mobile: "09123456789", personnelCode: "  " }).personnelCode).toBeNull();
    expect(createTeacherSchema.parse({ firstName: "a", lastName: "b", mobile: "09123456789", personnelCode: " T-12 " }).personnelCode).toBe("T-12");
  });

  it("requires a first and last name", () => {
    expect(createTeacherSchema.safeParse({ firstName: "", lastName: "محمدی", mobile: "09123456789" }).success).toBe(false);
    expect(createTeacherSchema.safeParse({ firstName: "زهرا", lastName: "   ", mobile: "09123456789" }).success).toBe(false);
  });

  it("strips a forged role instead of accepting it, so no input can grant a role", () => {
    const parsed = createTeacherSchema.parse({
      firstName: "زهرا",
      lastName: "محمدی",
      mobile: "09123456789",
      role: "SCHOOL_ADMIN",
    });
    expect(parsed).not.toHaveProperty("role");
  });

  it("strips a forged tenant or user identity", () => {
    const parsed = updateTeacherSchema.parse({
      teacherId: "3f0a1e6c-1a2b-4c3d-8e4f-5a6b7c8d9e0f",
      firstName: "زهرا",
      lastName: "محمدی",
      schoolId: "00000000-0000-0000-0000-000000000000",
      userId: "someone-else",
    });
    expect(parsed).not.toHaveProperty("schoolId");
    expect(parsed).not.toHaveProperty("userId");
  });
});

describe("teacherListFilterSchema", () => {
  it("accepts each whitelisted status axis", () => {
    for (const membershipStatus of ["ACTIVE", "SUSPENDED", "REVOKED"]) {
      expect(teacherListFilterSchema.parse({ membershipStatus }).membershipStatus).toBe(membershipStatus);
    }
    for (const invitationStatus of ["PENDING", "EXPIRED", "REVOKED", "CONSUMED", "NONE"]) {
      expect(teacherListFilterSchema.parse({ invitationStatus }).invitationStatus).toBe(invitationStatus);
    }
  });

  it("rejects an unknown status and an unknown sort field", () => {
    expect(teacherListFilterSchema.safeParse({ membershipStatus: "PENDING_ACTIVATION" }).success).toBe(false);
    expect(teacherListFilterSchema.safeParse({ invitationStatus: "ACTIVE" }).success).toBe(false);
    expect(teacherListFilterSchema.safeParse({ sort: "password" }).success).toBe(false);
  });

  it("rejects out-of-range paging rather than clamping it", () => {
    expect(teacherListFilterSchema.parse({}).page).toBe(1);
    expect(teacherListFilterSchema.parse({}).pageSize).toBe(25);
    // A hand-edited query string is refused, matching the student list filters.
    expect(teacherListFilterSchema.safeParse({ page: "0" }).success).toBe(false);
    expect(teacherListFilterSchema.safeParse({ pageSize: "1000" }).success).toBe(false);
    expect(teacherListFilterSchema.parse({ pageSize: "10" }).pageSize).toBe(10);
  });
});
