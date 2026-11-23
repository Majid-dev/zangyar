/**
 * Safety gate for OTP provider configuration.
 *
 * Mirrors the demo-seed gate in `src/features/auth/bootstrap/environment.ts`: a
 * refusal is a throw, it happens before any side effect, and the production case
 * is refused unconditionally with no override flag.
 *
 * The Development provider mints a known fixed code, which is exactly what makes
 * local development workable and exactly what must never be reachable from a
 * production deployment. Because the check runs from `authOptions()` — which both
 * `getAuth()` and `getAuthForTransaction()` call — an unsafe production
 * configuration fails application startup rather than surfacing on first use.
 */
export class OtpConfigurationError extends Error {
  constructor(
    public readonly code:
      | "DEVELOPMENT_PROVIDER_IN_PRODUCTION"
      | "PROVIDER_NOT_CONFIGURED"
      | "PROVIDER_NOT_IMPLEMENTED"
      | "INVALID_FIXED_CODE"
      | "MISSING_HASH_SECRET",
    message: string,
  ) {
    super(message);
    this.name = "OtpConfigurationError";
  }
}

export type OtpEnvironment = {
  nodeEnv: string | undefined;
  provider: string;
  fixedCode?: string | undefined;
  hashSecret?: string | undefined;
};

/** Reads the gate inputs from the process environment. */
export function currentOtpEnvironment(overrides: Partial<OtpEnvironment> = {}): OtpEnvironment {
  return {
    nodeEnv: process.env.NODE_ENV,
    provider: process.env.OTP_PROVIDER?.trim().toLowerCase() ?? (process.env.NODE_ENV === "production" ? "none" : "development"),
    fixedCode: process.env.OTP_DEV_FIXED_CODE ?? "123456",
    hashSecret: process.env.OTP_HASH_SECRET?.trim() || process.env.BETTER_AUTH_SECRET,
    ...overrides,
  };
}

/**
 * Startup check: refuses a configuration that is unsafe to run at all.
 *
 * Deliberately does **not** reject `provider: "none"`. An application with no OTP
 * provider configured is legitimate — it simply cannot issue codes, and that is
 * reported when one is actually requested (see `selectOtpProvider`). Rejecting
 * `none` here would make an ordinary production build fail to boot, since
 * `none` is the production default.
 */
export function assertOtpConfigurationSafe(environment: OtpEnvironment) {
  const nodeEnv = environment.nodeEnv ?? "";
  const isProduction = nodeEnv === "production";

  // A fixed known code must never be delivered by a production deployment. This
  // is refused before any other check and has no override: there is no
  // configuration in which the development provider is correct in production.
  if (isProduction && environment.provider === "development") {
    throw new OtpConfigurationError(
      "DEVELOPMENT_PROVIDER_IN_PRODUCTION",
      "OTP_PROVIDER=development is refused in production: it issues a fixed, publicly known code.",
    );
  }

  if (environment.provider === "sms") {
    // Reserved for the real provider. Failing loudly is preferable to falling
    // back to the development provider and quietly issuing fixed codes.
    throw new OtpConfigurationError(
      "PROVIDER_NOT_IMPLEMENTED",
      "OTP_PROVIDER=sms is reserved but no SMS provider is implemented yet.",
    );
  }

  if (environment.provider === "development") {
    const fixedCode = environment.fixedCode ?? "";
    if (!/^\d+$/.test(fixedCode)) {
      throw new OtpConfigurationError(
        "INVALID_FIXED_CODE",
        "The configured development OTP code must be one or more digits.",
      );
    }
  }

  return {
    nodeEnv,
    provider: environment.provider,
    // Never the code or the secret: this value is for operator logging.
    enabled: environment.provider !== "none",
  };
}

/**
 * Request-time gate: everything the startup check covers, plus a refusal to issue
 * codes when no provider is configured.
 *
 * Failing closed here is what keeps a production deployment without an SMS
 * provider from silently doing something worse than refusing.
 */
export function assertOtpProviderAllowed(environment: OtpEnvironment) {
  const safe = assertOtpConfigurationSafe(environment);

  if (environment.provider === "none") {
    throw new OtpConfigurationError(
      "PROVIDER_NOT_CONFIGURED",
      "No OTP provider is configured, so codes cannot be issued.",
    );
  }

  // Without a secret the keyed hash degrades to an unkeyed digest of a
  // six-digit value, which is trivially reversible from a leaked row.
  if (!environment.hashSecret || environment.hashSecret.length < 16) {
    throw new OtpConfigurationError(
      "MISSING_HASH_SECRET",
      "An OTP hash secret is required (OTP_HASH_SECRET, or BETTER_AUTH_SECRET as a fallback).",
    );
  }

  return safe;
}
