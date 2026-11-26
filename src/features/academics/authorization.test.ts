import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authMock = vi.hoisted(() => ({ getSession: vi.fn() }));
const dbMock = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), transaction: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession: authMock.getSession } }) }));
vi.mock("@/lib/db", () => ({ getDb: () => dbMock }));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: vi.fn() }));

import { createAcademicYear, createClassroom, updateSchoolConfiguration } from "./services";

const schoolA = "11111111-1111-4111-8111-111111111111";
const yearA = "33333333-3333-4333-8333-333333333333";
const gradeA = "44444444-4444-4444-8444-444444444444";

function queryChain<T extends readonly unknown[]>(result: T) {
  return Object.assign([...result], {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    // Active-school resolution orders candidate memberships so an unselected user
    // always lands in the same school, so the chain must remain resolvable after it.
    orderBy: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
  });
}

describe("academic management authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.getSession.mockResolvedValue({ user: { id: "admin-a" } });
    dbMock.select.mockReturnValue(queryChain([
      { membershipId: "membership-a", schoolId: schoolA, userId: "admin-a", role: "SCHOOL_ADMIN", school: { id: schoolA } },
    ]));
  });

  it("rejects school configuration for a teacher", async () => {
    dbMock.select.mockReturnValue(queryChain([
      { membershipId: "membership-teacher", schoolId: schoolA, userId: "teacher-a", role: "TEACHER", school: { id: schoolA } },
    ]));
    authMock.getSession.mockResolvedValue({ user: { id: "teacher-a" } });

    await expect(updateSchoolConfiguration({
      headers: new Headers(),
      input: { name: "School", timezone: "Asia/Tehran" },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a year created without an authenticated school membership", async () => {
    dbMock.select.mockReturnValue(queryChain([] as const));
    await expect(createAcademicYear({
      headers: new Headers(),
      input: { code: "1405", name: "سال تحصیلی", startDate: "2026-09-23", endDate: "2027-06-21" },
    })).rejects.toMatchObject({ code: "SCHOOL_ACCESS_DENIED" });
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects classroom creation when the request targets another tenant's year", async () => {
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ insert: vi.fn() }));
    dbMock.transaction.mockImplementation(transaction);
    await expect(createClassroom({
      headers: new Headers(),
      input: { academicYearId: yearA, gradeId: gradeA, code: "A", name: "Class" },
    })).rejects.toThrow();
  });
});
