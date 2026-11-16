import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("@/lib/db", () => ({
  getDbPool: () => ({ query }),
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    BETTER_AUTH_SECRET: "a-development-secret-with-more-than-32-characters",
    BETTER_AUTH_URL: "http://localhost:3000",
  }),
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("returns an ok response when the database is reachable", async () => {
    query.mockResolvedValueOnce({ rows: [{ ok: 1 }] });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "zangyar",
      database: "ok",
    });
    expect(query).toHaveBeenCalledWith("select 1");
  });

  it("returns service unavailable when the database check fails", async () => {
    query.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      service: "zangyar",
      database: "unavailable",
    });
  });
});
