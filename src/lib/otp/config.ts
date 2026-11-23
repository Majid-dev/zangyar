import process from "node:process";

import type { OtpPolicy, OtpPurposePolicies } from "./purpose";

/**
 * OTP configuration.
 *
 * Follows the demo-seed convention: defaults are local-development safe, every
 * value is overridable by environment variable, and the whole object can be
 * constructed from an injected `env` so tests need no process environment.
 *
 * `provider` selects the delivery implementation. It is resolved to a concrete
 * provider in `selection.ts`; nothing here knows how a code is delivered.
 */
export type OtpProviderName = "development" | "sms" | "none";

export type OtpConfig = {
  provider: OtpProviderName;
  /** Fixed code used by the Development provider. Never used in production. */
  fixedCode: string;
  /** Code length for generated codes (ignored by the fixed-code provider). */
  codeLength: number;
  /** Secret used to key the code hash. */
  hashSecret: string;
  policies: OtpPurposePolicies;
  /** Window over which `maxRequestsPerWindow` is counted, in seconds. */
  requestWindowSeconds: number;
  /** Requests per number per window, across all purposes. */
  requestMax: number;
};

const DEFAULT_CODE_LENGTH = 6;
const DEFAULT_REQUEST_WINDOW_SECONDS = 600;
const DEFAULT_REQUEST_MAX = 5;

function policy(overrides: Partial<OtpPolicy> = {}): OtpPolicy {
  return {
    expirySeconds: 120,
    maxAttempts: 5,
    resendCooldownSeconds: 60,
    maxRequestsPerWindow: DEFAULT_REQUEST_MAX,
    ...overrides,
  };
}

const DEFAULT_POLICIES: OtpPurposePolicies = {
  // A teacher is mid-activation and waiting, so a short window and a tight
  // attempt ceiling are enough.
  TEACHER_ACTIVATION: policy(),
  LOGIN: policy(),
  // Recovery is the most attractive target, so it gets the fewest attempts.
  PASSWORD_RESET: policy({ maxAttempts: 3 }),
};

/** Parses a positive integer from the environment, falling back on absence. */
function positiveInt(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim().length === 0) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * The provider used when none is configured.
 *
 * Development gets the fixed-code provider so a clean checkout works with no
 * setup. Anything else — production included — gets `none`, which fails closed
 * at selection time rather than silently fabricating codes.
 */
function defaultProviderName(env: NodeJS.ProcessEnv): OtpProviderName {
  return env.NODE_ENV === "production" ? "none" : "development";
}

function providerName(env: NodeJS.ProcessEnv): OtpProviderName {
  const raw = env.OTP_PROVIDER?.trim().toLowerCase();
  if (raw === "development" || raw === "sms" || raw === "none") return raw;
  return defaultProviderName(env);
}

export function getOtpConfig(env: NodeJS.ProcessEnv = process.env): OtpConfig {
  const codeLength = positiveInt(env.OTP_CODE_LENGTH, DEFAULT_CODE_LENGTH);
  const expirySeconds = positiveInt(env.OTP_TTL_SECONDS, DEFAULT_POLICIES.TEACHER_ACTIVATION.expirySeconds);
  const maxAttempts = positiveInt(env.OTP_MAX_ATTEMPTS, DEFAULT_POLICIES.TEACHER_ACTIVATION.maxAttempts);
  const cooldown = positiveInt(env.OTP_RESEND_COOLDOWN_SECONDS, DEFAULT_POLICIES.TEACHER_ACTIVATION.resendCooldownSeconds);
  const requestWindowSeconds = positiveInt(env.OTP_REQUEST_WINDOW_SECONDS, DEFAULT_REQUEST_WINDOW_SECONDS);
  const requestMax = positiveInt(env.OTP_REQUEST_MAX, DEFAULT_REQUEST_MAX);

  const overridden: OtpPolicy = {
    expirySeconds,
    maxAttempts,
    resendCooldownSeconds: cooldown,
    maxRequestsPerWindow: requestMax,
  };

  return {
    provider: providerName(env),
    // Default matches the documented Development fixed code. It is only ever used
    // by the Development provider, which is refused in production.
    fixedCode: env.OTP_DEV_FIXED_CODE ?? "123456",
    codeLength,
    // A dedicated secret is preferred; the auth secret is an acceptable stand-in
    // so a clean checkout does not need one more variable. An empty secret makes
    // the keyed hash meaningless, so it is caught by the environment gate.
    hashSecret: env.OTP_HASH_SECRET?.trim() || env.BETTER_AUTH_SECRET || "",
    policies: {
      TEACHER_ACTIVATION: { ...DEFAULT_POLICIES.TEACHER_ACTIVATION, ...overridden },
      LOGIN: { ...DEFAULT_POLICIES.LOGIN, ...overridden },
      PASSWORD_RESET: { ...DEFAULT_POLICIES.PASSWORD_RESET, ...overridden },
    },
    requestWindowSeconds,
    requestMax,
  };
}

/**
 * Summary safe to log or return.
 *
 * The fixed code and the hash secret are omitted entirely rather than masked, so
 * there is no code path that could print them by accident.
 */
export function redactedOtpSummary(config: OtpConfig) {
  return {
    provider: config.provider,
    codeLength: config.codeLength,
    requestWindowSeconds: config.requestWindowSeconds,
    requestMax: config.requestMax,
    policies: config.policies,
  };
}
