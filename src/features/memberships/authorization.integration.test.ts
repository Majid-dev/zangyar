import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));
const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession: authMock.getSession } }),
}));
vi.mock("@/lib/db", () => ({ getDb: () => dbMock }));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: vi.fn() }));

import { listSchoolMemberships } from "./queries";
import { createMembership, updateMembershipStatus } from "./services";

const schoolA = "11111111-1111-4111-8111-111111111111";
const schoolB = "22222222-2222-4222-8222-222222222222";
const membershipA = "33333333-3333-4333-8333-333333333333";
const membershipB = "44444444-4444-4444-8444-444444444444";

function chain<T extends readonly unknown[]>(result: T) {
  return Object.assign([...result], {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
  });
}

describe("membership authorization boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.getSession.mockResolvedValue({ user: { id: "admin-1" } });
    dbMock.select.mockReturnValue(
      chain([
        {
          membershipId: membershipA,
          schoolId: schoolA,
          userId: "admin-1",
          role: "SCHOOL_ADMIN",
          school: { id: schoolA },
        },
      ]),
    );
  });

  it("rejects unauthenticated membership listing", async () => {
    authMock.getSession.mockResolvedValue(null);
    await expect(listSchoolMemberships({ headers: new Headers(), schoolId: schoolA })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("rejects a teacher from an admin-only membership operation", async () => {
    dbMock.select.mockReturnValue(
      chain([
        {
          membershipId: membershipA,
          schoolId: schoolA,
          userId: "teacher-1",
          role: "TEACHER",
          school: { id: schoolA },
        },
      ]),
    );
    authMock.getSession.mockResolvedValue({ user: { id: "teacher-1" } });

    await expect(listSchoolMemberships({ headers: new Headers(), schoolId: schoolA })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("does not list a different tenant when schoolId is supplied", async () => {
    dbMock.select.mockReturnValue(chain([] as const));
    await expect(listSchoolMemberships({ headers: new Headers(), schoolId: schoolB })).rejects.toMatchObject({
      code: "SCHOOL_ACCESS_DENIED",
    });
  });

  it("requires a verified membership before creating a membership", async () => {
    dbMock.select.mockReturnValue(chain([] as const));
    await expect(
      createMembership({
        headers: new Headers(),
        input: { userId: "teacher-2", role: "TEACHER" },
      }),
    ).rejects.toMatchObject({ code: "SCHOOL_ACCESS_DENIED" });
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("scopes membership status updates to the active tenant", async () => {
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      update: vi.fn(() => ({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      })),
    }));
    dbMock.transaction.mockImplementation(transaction);
    dbMock.select.mockReturnValue(
      chain([
        {
          membershipId: membershipA,
          schoolId: schoolA,
          userId: "admin-1",
          role: "SCHOOL_ADMIN",
          school: { id: schoolA },
        },
      ]),
    );

    await expect(
      updateMembershipStatus({
        headers: new Headers(),
        input: { membershipId: membershipB, status: "REVOKED" },
      }),
    ).rejects.toThrow("School membership not found.");
  });
});
