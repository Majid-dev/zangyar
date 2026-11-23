import { describe, expect, it } from "vitest";

import { getOtpConfig, redactedOtpSummary } from "./config";
import { assertOtpConfigurationSafe, assertOtpProviderAllowed, OtpConfigurationError } from "./environment";

/**
 * The OTP configuration gate is the one hard security boundary in this slice, so
 * it is exercised directly, without a database or a process environment.
 */

const BASE = {
  provider: "development",
  fixedCode: "123456",
  hashSecret: "a-secret-long-enough-to-be-usable",
};

describe("OTP provider selection defaults", () => {
  it("defaults to the development provider outside production", () => {
    expect(getOtpConfig({ NODE_ENV: "development" } as NodeJS.ProcessEnv).provider).toBe("development");
    expect(getOtpConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv).provider).toBe("development");
  });

  it("defaults to no provider in production, so a build does not need OTP configuration", () => {
    // This is what keeps `next build` working: production defaults to "none"
    // rather than to the fixed-code provider.
    expect(getOtpConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv).provider).toBe("none");
  });

  it("honors an explicit provider override", () => {
    expect(getOtpConfig({ NODE_ENV: "development", OTP_PROVIDER: "none" } as NodeJS.ProcessEnv).provider).toBe("none");
    expect(getOtpConfig({ NODE_ENV: "test", OTP_PROVIDER: "sms" } as NodeJS.ProcessEnv).provider).toBe("sms");
  });

  it("falls back to the auth secret when no dedicated OTP secret is configured", () => {
    const config = getOtpConfig({ NODE_ENV: "development", BETTER_AUTH_SECRET: "the-auth-secret-value-here" } as NodeJS.ProcessEnv);
    expect(config.hashSecret).toBe("the-auth-secret-value-here");
  });

  it("applies the default fixed code and code length", () => {
    const config = getOtpConfig({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
    expect(config.fixedCode).toBe("123456");
    expect(config.codeLength).toBe(6);
  });

  it("keeps the fixed code and the secret out of the loggable summary", () => {
    const config = getOtpConfig({ NODE_ENV: "development", OTP_HASH_SECRET: "a-secret-long-enough-to-be-usable" } as NodeJS.ProcessEnv);
    const summary = redactedOtpSummary(config);
    const serialized = JSON.stringify(summary);

    expect(serialized).not.toContain(config.fixedCode);
    expect(serialized).not.toContain(config.hashSecret);
    expect(summary).not.toHaveProperty("fixedCode");
    expect(summary).not.toHaveProperty("hashSecret");
  });
});

describe("OTP production safety gate", () => {
  it("refuses the fixed-code provider in production, with no override", () => {
    expect(() =>
      assertOtpProviderAllowed({ nodeEnv: "production", ...BASE }),
    ).toThrowError(OtpConfigurationError);
  });

  it("refuses it at startup too, so an unsafe deployment fails to boot", () => {
    expect(() => assertOtpConfigurationSafe({ nodeEnv: "production", ...BASE })).toThrowError(OtpConfigurationError);
  });

  it("allows the development provider outside production", () => {
    expect(assertOtpProviderAllowed({ nodeEnv: "development", ...BASE })).toMatchObject({ provider: "development" });
    expect(assertOtpProviderAllowed({ nodeEnv: "test", ...BASE })).toMatchObject({ provider: "development" });
  });

  it("rejects the reserved sms provider rather than falling back to fixed codes", () => {
    expect(() =>
      assertOtpProviderAllowed({ nodeEnv: "production", provider: "sms", fixedCode: "123456", hashSecret: BASE.hashSecret }),
    ).toThrowError(OtpConfigurationError);
    expect(() =>
      assertOtpProviderAllowed({ nodeEnv: "development", provider: "sms", fixedCode: "123456", hashSecret: BASE.hashSecret }),
    ).toThrowError(OtpConfigurationError);
  });

  it("fails closed when no provider is configured", () => {
    // Startup tolerates an unconfigured provider...
    expect(() =>
      assertOtpConfigurationSafe({ nodeEnv: "production", provider: "none", fixedCode: "123456", hashSecret: BASE.hashSecret }),
    ).not.toThrow();

    // ...but requesting a code does not.
    expect(() =>
      assertOtpProviderAllowed({ nodeEnv: "production", provider: "none", fixedCode: "123456", hashSecret: BASE.hashSecret }),
    ).toThrowError(OtpConfigurationError);
  });

  it("rejects a fixed code that is not made of digits", () => {
    for (const fixedCode of ["", "abcdef", "12 34", "12-34"]) {
      expect(() =>
        assertOtpProviderAllowed({ nodeEnv: "development", provider: "development", fixedCode, hashSecret: BASE.hashSecret }),
      ).toThrowError(OtpConfigurationError);
    }
  });

  it("requires a usable hash secret, because an unkeyed digest of six digits is reversible", () => {
    expect(() =>
      assertOtpProviderAllowed({ nodeEnv: "development", provider: "development", fixedCode: "123456", hashSecret: "" }),
    ).toThrowError(OtpConfigurationError);
    expect(() =>
      assertOtpProviderAllowed({ nodeEnv: "development", provider: "development", fixedCode: "123456", hashSecret: "short" }),
    ).toThrowError(OtpConfigurationError);
    expect(() =>
      assertOtpProviderAllowed({ nodeEnv: "development", provider: "development", fixedCode: "123456", hashSecret: undefined }),
    ).toThrowError(OtpConfigurationError);
  });

  it("never returns the code or the secret in its result", () => {
    const result = assertOtpProviderAllowed({ nodeEnv: "development", ...BASE });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(BASE.fixedCode);
    expect(serialized).not.toContain(BASE.hashSecret);
  });
});
