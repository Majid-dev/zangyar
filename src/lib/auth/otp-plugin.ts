import "server-only";

import { eq } from "drizzle-orm";

import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import * as z from "zod";

import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { OTP_PURPOSES } from "@/lib/otp/purpose";
import { normalizeIranianMobile } from "@/lib/mobile";

import { OtpError, requestOtp, verifyOtp } from "@/features/otp/service";

/**
 * OTP endpoints.
 *
 * These live as a Better Auth plugin rather than Server Actions because the login
 * endpoint must set the session cookie, which needs an endpoint context. The
 * domain logic stays in `src/features/otp/service`, so this file is a thin HTTP
 * boundary: parse, call the service, map refusals to status codes.
 *
 * Failures are raised as `APIError` — the mechanism Better Auth's own endpoints
 * use — so the status code is carried on the response rather than depending on the
 * success-path `json` helper.
 *
 * Better Auth's own `/phone-number/*` OTP routes stay disabled: their storage is
 * plaintext, purpose-less, and has no resend cooldown (see docs/DECISIONS.md).
 */

const purposeSchema = z.enum(OTP_PURPOSES);
const mobileSchema = z.string().trim().min(1);
const codeSchema = z.string().trim().min(1);

/** One message for every verification failure, so responses cannot be probed. */
const INVALID_CODE_MESSAGE = "This code is invalid or has expired.";

/**
 * Purposes that may reveal whether an account exists.
 *
 * Activation already reveals it: the teacher reached this flow through an
 * invitation link that names them. Login and password reset must not, so an
 * unknown number gets the same response as a known one and no code is delivered.
 */
const REVEALING_PURPOSES = new Set(["TEACHER_ACTIVATION"]);

/** Raises the HTTP failure matching a service refusal, without leaking which check failed. */
function raiseForOtpError(error: unknown): never {
  if (error instanceof OtpError) {
    if (error.code === "COOLDOWN" || error.code === "RATE_LIMITED") {
      throw APIError.fromStatus(429, { message: error.message });
    }
    if (error.code === "INVALID_MOBILE") {
      throw APIError.fromStatus(400, { message: error.message });
    }
    if (error.code === "DELIVERY_FAILED") {
      throw APIError.fromStatus(502, { message: error.message });
    }
    throw APIError.fromStatus(400, { message: error.message });
  }
  throw error;
}

export function otpPlugin() {
  return {
    id: "zangyar-otp",
    endpoints: {
      /**
       * Issues and delivers a code.
       *
       * For non-revealing purposes this always answers the same way, including when
       * no account exists, so it cannot be used to enumerate members.
       */
      otpRequest: createAuthEndpoint(
        "/otp/request",
        {
          method: "POST",
          body: z.object({ purpose: purposeSchema, mobile: mobileSchema }),
        },
        async (ctx) => {
          const { purpose, mobile } = ctx.body;
          const normalized = normalizeIranianMobile(mobile);
          const reveals = REVEALING_PURPOSES.has(purpose);

          // A non-revealing purpose only proceeds for a verified account; every
          // other case returns the same success shape without sending anything.
          if (!reveals) {
            if (!normalized) return ctx.json({ ok: true as const });
            const [account] = await getDb()
              .select({ id: users.id, phoneNumberVerified: users.phoneNumberVerified })
              .from(users)
              .where(eq(users.phoneNumber, normalized))
              .limit(1);
            if (!account || !account.phoneNumberVerified) return ctx.json({ ok: true as const });
          }

          if (!normalized) {
            // Only a revealing purpose has a caller who should be told the number
            // is unusable; the others stay uniform.
            if (reveals) throw APIError.fromStatus(400, { message: "The mobile number is invalid." });
            return ctx.json({ ok: true as const });
          }

          try {
            await requestOtp({ purpose, mobile: normalized, actorUserId: ctx.context.session?.user.id ?? null });
          } catch (error) {
            if (reveals) raiseForOtpError(error);
            // A refusal on a non-revealing purpose is reported as the uniform
            // success, so throttling or a delivery problem is not observable.
            return ctx.json({ ok: true as const });
          }

          return ctx.json({ ok: true as const });
        },
      ),

      /**
       * Verifies a code without creating a session.
       *
       * Used by flows that continue elsewhere — teacher activation consumes the
       * result inside its own transaction.
       */
      otpVerify: createAuthEndpoint(
        "/otp/verify",
        {
          method: "POST",
          body: z.object({ purpose: purposeSchema, mobile: mobileSchema, code: codeSchema }),
        },
        async (ctx) => {
          try {
            const result = await verifyOtp(ctx.body);
            return ctx.json({ ok: true as const, purpose: result.purpose });
          } catch (error) {
            if (error instanceof OtpError && error.code === "INVALID_CODE") {
              throw APIError.fromStatus(400, { message: INVALID_CODE_MESSAGE });
            }
            raiseForOtpError(error);
          }
        },
      ),

      /**
       * Verifies a LOGIN code and starts a session.
       *
       * A second authentication path alongside phone+password, so it is treated as
       * security-sensitive: purpose-scoped, and it only proceeds when the account
       * exists and has a verified number.
       */
      otpLogin: createAuthEndpoint(
        "/otp/login",
        {
          method: "POST",
          body: z.object({ mobile: mobileSchema, code: codeSchema }),
        },
        async (ctx) => {
          const normalized = normalizeIranianMobile(ctx.body.mobile);
          if (!normalized) throw APIError.fromStatus(401, { message: INVALID_CODE_MESSAGE });

          try {
            await verifyOtp({ purpose: "LOGIN", mobile: normalized, code: ctx.body.code });
          } catch (error) {
            if (error instanceof OtpError && error.code === "INVALID_CODE") {
              throw APIError.fromStatus(401, { message: INVALID_CODE_MESSAGE });
            }
            raiseForOtpError(error);
          }

          const [user] = await getDb().select().from(users).where(eq(users.phoneNumber, normalized)).limit(1);
          if (!user) throw APIError.fromStatus(401, { message: INVALID_CODE_MESSAGE });

          // Mirrors the phone-number plugin: mint a session, then let Better Auth
          // write the cookie onto this response.
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });

          return ctx.json({ ok: true as const, user: { id: user.id } });
        },
      ),

      /**
       * Verifies a PASSWORD_RESET code and sets a new password.
       *
       * Existing sessions are revoked afterwards, so a reset also ends any session
       * an attacker may already hold.
       */
      otpResetPassword: createAuthEndpoint(
        "/otp/reset-password",
        {
          method: "POST",
          body: z.object({ mobile: mobileSchema, code: codeSchema, newPassword: z.string().min(8).max(128) }),
        },
        async (ctx) => {
          const normalized = normalizeIranianMobile(ctx.body.mobile);
          if (!normalized) throw APIError.fromStatus(401, { message: INVALID_CODE_MESSAGE });

          try {
            await verifyOtp({ purpose: "PASSWORD_RESET", mobile: normalized, code: ctx.body.code });
          } catch (error) {
            if (error instanceof OtpError && error.code === "INVALID_CODE") {
              throw APIError.fromStatus(401, { message: INVALID_CODE_MESSAGE });
            }
            raiseForOtpError(error);
          }

          const [user] = await getDb().select().from(users).where(eq(users.phoneNumber, normalized)).limit(1);
          if (!user) throw APIError.fromStatus(401, { message: INVALID_CODE_MESSAGE });

          await ctx.context.internalAdapter.updatePassword(
            user.id,
            await ctx.context.password.hash(ctx.body.newPassword),
          );
          await ctx.context.internalAdapter.deleteUserSessions(user.id);

          return ctx.json({ ok: true as const });
        },
      ),
    },
    rateLimit: [
      {
        // Coarse per-IP throttle for the whole OTP surface. The per-number limits in
        // the service are what actually bound a single target's exposure.
        window: 60,
        max: 20,
        pathMatcher: (path: string) => path.startsWith("/otp"),
      },
    ],
  } satisfies BetterAuthPlugin;
}
