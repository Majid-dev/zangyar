import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateInvitationToken, hashInvitationToken, invitationExpiry } from "./tokens";

describe("invitation tokens", () => {
  it("produces a URL-safe token with 256 bits of entropy", () => {
    const token = generateInvitationToken();
    // 32 random bytes in base64url: 43 characters, alphabet limited to what a
    // path segment can carry without escaping.
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateInvitationToken()));
    expect(tokens.size).toBe(200);
  });

  it("hashes to a stable 64-character hex digest that never equals the token", () => {
    const token = generateInvitationToken();
    const hash = hashInvitationToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashInvitationToken(token));
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
  });

  it("produces a different hash for a different token", () => {
    expect(hashInvitationToken(generateInvitationToken())).not.toBe(hashInvitationToken(generateInvitationToken()));
  });

  it("honors a configured lifetime", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(invitationExpiry(now, 72).toISOString()).toBe("2026-01-04T00:00:00.000Z");
    expect(invitationExpiry(now, 1).toISOString()).toBe("2026-01-01T01:00:00.000Z");
    expect(invitationExpiry(now, 24 * 30).getTime()).toBeGreaterThan(invitationExpiry(now, 72).getTime());
  });
});
