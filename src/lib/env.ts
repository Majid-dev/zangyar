import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().startsWith("postgres"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  /**
   * OTP settings. All optional: the OTP layer has its own defaults
   * (`src/lib/otp/config.ts`) and refuses an unsafe combination rather than
   * relying on these being present. Declared here so a malformed value is caught
   * at the same boundary as the rest of the environment.
   */
  OTP_PROVIDER: z.enum(["development", "sms", "none"]).optional(),
  OTP_DEV_FIXED_CODE: z.string().regex(/^\d+$/).optional(),
  OTP_HASH_SECRET: z.string().min(16).optional(),
  OTP_CODE_LENGTH: z.coerce.number().int().min(4).max(10).optional(),
  OTP_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).optional(),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).optional(),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(3600).optional(),
  OTP_REQUEST_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).optional(),
  OTP_REQUEST_MAX: z.coerce.number().int().min(1).max(100).optional(),
});

export function getEnv() {
  return envSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    OTP_PROVIDER: process.env.OTP_PROVIDER?.trim().toLowerCase() || undefined,
    OTP_DEV_FIXED_CODE: process.env.OTP_DEV_FIXED_CODE,
    OTP_HASH_SECRET: process.env.OTP_HASH_SECRET,
    OTP_CODE_LENGTH: process.env.OTP_CODE_LENGTH,
    OTP_TTL_SECONDS: process.env.OTP_TTL_SECONDS,
    OTP_MAX_ATTEMPTS: process.env.OTP_MAX_ATTEMPTS,
    OTP_RESEND_COOLDOWN_SECONDS: process.env.OTP_RESEND_COOLDOWN_SECONDS,
    OTP_REQUEST_WINDOW_SECONDS: process.env.OTP_REQUEST_WINDOW_SECONDS,
    OTP_REQUEST_MAX: process.env.OTP_REQUEST_MAX,
  });
}
