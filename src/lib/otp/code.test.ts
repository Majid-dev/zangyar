import { describe, expect, it } from "vitest";

import { generateOtpCode, hashOtpCode, otpExpiry, verifyOtpCode } from "./code";

const SECRET = "a-test-secret-that-is-long-enough";

describe("OTP code hashing", () => {
  it("generates a code of the requested length using only digits", () => {
    for (const length of [4, 6, 8]) {
      const code = generateOtpCode(length);
      expect(code).toHaveLength(length);
      expect(code).toMatch(/^\d+$/);
    }
  });

  it("does not repeat across many calls", () => {
    const codes = new Set(Array.from({ length: 300 }, () => generateOtpCode(6)));
    // A collision here would be a real defect, not test flake: 10^6 values and 300
    // draws makes an accidental clash vanishingly unlikely.
    expect(codes.size).toBeGreaterThan(295);
  });

  it("never stores the code itself, and hashes stably", () => {
    const code = "123456";
    const hash = hashOtpCode(code, SECRET);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(code);
    expect(hash).not.toContain(code);
    expect(hash).toBe(hashOtpCode(code, SECRET));
  });

  it("produces a different hash per code", () => {
    expect(hashOtpCode("123456", SECRET)).not.toBe(hashOtpCode("123457", SECRET));
  });

  it("requires the secret, so a leaked row is not brute-forceable on its own", () => {
    // A six-digit code has only 10^6 values: without the key, an attacker holding
    // the stored hash could enumerate them offline. Keying the hash is what makes
    // a database-only leak insufficient.
    expect(hashOtpCode("123456", SECRET)).not.toBe(hashOtpCode("123456", "a-different-secret-value-here"));
  });

  it("accepts the matching code and rejects anything else", () => {
    const hash = hashOtpCode("246810", SECRET);
    expect(verifyOtpCode("246810", hash, SECRET)).toBe(true);
    expect(verifyOtpCode("246811", hash, SECRET)).toBe(false);
    expect(verifyOtpCode("", hash, SECRET)).toBe(false);
  });

  it("rejects a code of the wrong length without throwing", () => {
    // timingSafeEqual throws on unequal buffer lengths; the comparison must not
    // turn a wrong-length guess into a distinguishable error.
    const hash = hashOtpCode("123456", SECRET);
    expect(() => verifyOtpCode("12345", hash, SECRET)).not.toThrow();
    expect(verifyOtpCode("12345", hash, SECRET)).toBe(false);
  });

  it("rejects a code verified against a different secret", () => {
    const hash = hashOtpCode("123456", SECRET);
    expect(verifyOtpCode("123456", hash, "another-secret-value-entirely")).toBe(false);
  });
});

describe("OTP expiry", () => {
  it("adds the configured lifetime to the issue instant", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(otpExpiry(now, 120).toISOString()).toBe("2026-01-01T00:02:00.000Z");
    expect(otpExpiry(now, 30).getTime()).toBeLessThan(otpExpiry(now, 120).getTime());
  });
});
