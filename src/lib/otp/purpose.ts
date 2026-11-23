/**
 * Why a code was issued.
 *
 * A challenge is keyed by purpose as well as mobile number, so a code obtained
 * for one flow cannot be replayed in another: a LOGIN code is structurally
 * unable to satisfy a TEACHER_ACTIVATION check. The database enum stores the
 * same three values.
 */
export const OTP_PURPOSES = ["TEACHER_ACTIVATION", "LOGIN", "PASSWORD_RESET"] as const;

export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export function isOtpPurpose(value: unknown): value is OtpPurpose {
  return typeof value === "string" && (OTP_PURPOSES as readonly string[]).includes(value);
}

/** Persian labels for operator-facing surfaces. */
export const OTP_PURPOSE_LABELS: Record<OtpPurpose, string> = {
  TEACHER_ACTIVATION: "فعال‌سازی حساب دبیر",
  LOGIN: "ورود به حساب",
  PASSWORD_RESET: "بازیابی گذرواژه",
};

/**
 * Per-purpose operational policy.
 *
 * Held as data rather than constants inside the verification logic so a purpose
 * can be retuned (a stricter window for password reset, say) without editing the
 * service.
 */
export type OtpPolicy = {
  /** How long an issued code stays valid. */
  expirySeconds: number;
  /** Wrong-code submissions allowed before the challenge is exhausted. */
  maxAttempts: number;
  /** Minimum wait before the same purpose and number may request another code. */
  resendCooldownSeconds: number;
  /** Requests allowed per number within the rate-limit window. */
  maxRequestsPerWindow: number;
};

export type OtpPurposePolicies = Record<OtpPurpose, OtpPolicy>;
