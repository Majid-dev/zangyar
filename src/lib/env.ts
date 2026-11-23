import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgres"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  /**
   * How long a teacher activation link stays usable. Configurable because the
   * value is operational policy, not a fixed product constant.
   */
  TEACHER_INVITATION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(72),
});

export function getEnv() {
  return envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    TEACHER_INVITATION_TTL_HOURS: process.env.TEACHER_INVITATION_TTL_HOURS,
  });
}
