import { describe, expect, it } from "vitest";

import {
  completeTeacherRegistrationSchema,
  deleteRegistrationSchema,
  registerTeacherMobileSchema,
  setTeacherStatusSchema,
  teacherListFilterSchema,
  updateRegistrationMobileSchema,
} from "./schema";

const registrationId = "3f0a1e6c-1a2b-4c3d-8e4f-5a6b7c8d9e0f";

describe("registerTeacherMobileSchema", () => {
  it("normalizes every accepted Iranian mobile spelling to one canonical form", () => {
    const spellings = ["09123456789", "+989123456789", "00989123456789", "9123456789", "۰۹۱۲۳۴۵۶۷۸۹", "٠٩١٢٣٤٥٦٧٨٩", "0912 345 6789", "0912-345-6789", "(0912) 3456789"];

    for (const mobile of spellings) {
      expect(registerTeacherMobileSchema.parse({ mobile }).mobile).toBe("09123456789");
    }
  });

  it("rejects a number that is not an Iranian mobile", () => {
    for (const mobile of ["0812345678", "08123456789", "0912345678", "091234567890", "02123456789", "not-a-number"]) {
      expect(registerTeacherMobileSchema.safeParse({ mobile }).success).toBe(false);
    }
  });

  it("strips any attempt to set a role, tenant, or user on the registration", () => {
    // Only the number is the admin's to assert; nothing else may be supplied.
    const parsed = registerTeacherMobileSchema.parse({
      mobile: "09123456789",
      role: "SCHOOL_ADMIN",
      schoolId: "00000000-0000-0000-0000-000000000000",
      userId: "someone-else",
      status: "ACTIVE",
      // The teacher's own details are theirs to supply at registration, so an admin
      // cannot assert them here either.
      firstName: "ناشناس",
      lastName: "ناشناس",
      personnelCode: "T-12",
    });
    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("schoolId");
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("firstName");
    expect(parsed).not.toHaveProperty("lastName");
    expect(parsed).not.toHaveProperty("personnelCode");
  });
});

describe("updateRegistrationMobileSchema", () => {
  it("normalizes the corrected number", () => {
    expect(updateRegistrationMobileSchema.parse({ registrationId, mobile: "۰۹۱۲۳۴۵۶۷۸۹" }).mobile).toBe("09123456789");
    expect(updateRegistrationMobileSchema.parse({ registrationId, mobile: "+98 912 345 6789" }).mobile).toBe("09123456789");
  });

  it("rejects an invalid number", () => {
    expect(updateRegistrationMobileSchema.safeParse({ registrationId, mobile: "02123456789" }).success).toBe(false);
  });
});

describe("deleteRegistrationSchema", () => {
  it("requires a registration id and nothing else", () => {
    expect(deleteRegistrationSchema.parse({ registrationId })).toEqual({ registrationId });
    // A stray tenant or actor field is stripped rather than accepted, so the
    // school can only ever come from the verified session.
    const parsed = deleteRegistrationSchema.parse({ registrationId, schoolId: "00000000-0000-0000-0000-000000000000" });
    expect(parsed).not.toHaveProperty("schoolId");
    expect(deleteRegistrationSchema.safeParse({}).success).toBe(false);
  });
});

describe("setTeacherStatusSchema", () => {
  it("accepts only the membership statuses a School Admin may set", () => {
    for (const status of ["ACTIVE", "SUSPENDED", "REJECTED"]) {
      expect(setTeacherStatusSchema.parse({ registrationId, status }).status).toBe(status);
    }
  });

  it("rejects a status the admin does not own", () => {
    // PENDING_ADMIN_APPROVAL is where a registration starts and REVOKED is not a
    // teacher access state, so neither is a legal target.
    for (const status of ["PENDING_ADMIN_APPROVAL", "REVOKED", "PENDING", "active"]) {
      expect(setTeacherStatusSchema.safeParse({ registrationId, status }).success).toBe(false);
    }
  });

  it("strips a forged user, role, or school", () => {
    const parsed = setTeacherStatusSchema.parse({
      registrationId,
      status: "ACTIVE",
      userId: "someone-else",
      role: "SCHOOL_ADMIN",
      schoolId: "00000000-0000-0000-0000-000000000000",
    });
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("schoolId");
  });
});

describe("completeTeacherRegistrationSchema", () => {
  const base = {
    mobile: "09123456789",
    code: "123456",
    firstName: "زهرا",
    lastName: "محمدی",
    password: "A-secure-password-1",
    confirmPassword: "A-secure-password-1",
  };

  it("accepts a well-formed registration and normalizes the number", () => {
    const parsed = completeTeacherRegistrationSchema.parse({ ...base, mobile: "+98 912 345 6789" });
    expect(parsed.mobile).toBe("09123456789");
  });

  it("accepts a Persian-digit verification code", () => {
    expect(completeTeacherRegistrationSchema.parse({ ...base, code: "۱۲۳۴۵۶" }).code).toBe("123456");
  });

  it("requires the password confirmation to match", () => {
    expect(completeTeacherRegistrationSchema.safeParse({ ...base, confirmPassword: "different-value" }).success).toBe(false);
  });

  it("enforces the password length policy", () => {
    expect(completeTeacherRegistrationSchema.safeParse({ ...base, password: "short", confirmPassword: "short" }).success).toBe(false);
  });

  it("requires a name", () => {
    expect(completeTeacherRegistrationSchema.safeParse({ ...base, firstName: "   " }).success).toBe(false);
    expect(completeTeacherRegistrationSchema.safeParse({ ...base, lastName: "" }).success).toBe(false);
  });

  it("takes the personnel code from the teacher and treats it as optional", () => {
    // A school that issues no personnel codes must not be blocked from receiving
    // registrations, so an empty or absent value is valid and stored as null.
    expect(completeTeacherRegistrationSchema.parse(base).personnelCode).toBeNull();
    expect(completeTeacherRegistrationSchema.parse({ ...base, personnelCode: "  " }).personnelCode).toBeNull();
    expect(completeTeacherRegistrationSchema.parse({ ...base, personnelCode: " T-12 " }).personnelCode).toBe("T-12");
    expect(completeTeacherRegistrationSchema.safeParse({ ...base, personnelCode: "x".repeat(51) }).success).toBe(false);
  });

  it("strips a forged school, membership, or role", () => {
    // The schools involved are resolved server-side from the authorized number, so
    // a client cannot steer registration at a tenant it is not authorized for.
    const parsed = completeTeacherRegistrationSchema.parse({
      ...base,
      schoolId: "00000000-0000-0000-0000-000000000000",
      membershipId: "00000000-0000-0000-0000-000000000001",
      role: "SCHOOL_ADMIN",
      status: "ACTIVE",
    });
    expect(parsed).not.toHaveProperty("schoolId");
    expect(parsed).not.toHaveProperty("membershipId");
    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("status");
  });
});

describe("teacherListFilterSchema", () => {
  it("accepts each whitelisted display status", () => {
    for (const status of ["PENDING_REGISTRATION", "PENDING_ADMIN_APPROVAL", "ACTIVE", "REJECTED", "DEACTIVATED"]) {
      expect(teacherListFilterSchema.parse({ status }).status).toBe(status);
    }
  });

  it("accepts the personnel code and the personnel sort field", () => {
    expect(teacherListFilterSchema.parse({ personnelCode: "T-12" }).personnelCode).toBe("T-12");
    expect(teacherListFilterSchema.parse({ sort: "personnel" }).sort).toBe("personnel");
  });

  it("accepts the verification sort field", () => {
    expect(teacherListFilterSchema.parse({ sort: "verification" }).sort).toBe("verification");
  });

  it("rejects an unknown status and an unknown sort field", () => {
    expect(teacherListFilterSchema.safeParse({ status: "PENDING_ACTIVATION" }).success).toBe(false);
    expect(teacherListFilterSchema.safeParse({ status: "PENDING" }).success).toBe(false);
    expect(teacherListFilterSchema.safeParse({ sort: "password" }).success).toBe(false);
  });

  it("rejects out-of-range paging rather than clamping it", () => {
    expect(teacherListFilterSchema.parse({}).page).toBe(1);
    expect(teacherListFilterSchema.parse({}).pageSize).toBe(25);
    expect(teacherListFilterSchema.safeParse({ page: "0" }).success).toBe(false);
    expect(teacherListFilterSchema.safeParse({ pageSize: "1000" }).success).toBe(false);
    expect(teacherListFilterSchema.parse({ pageSize: "10" }).pageSize).toBe(10);
  });
});
