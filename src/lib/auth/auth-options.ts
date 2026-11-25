import "server-only";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { phoneNumber } from "better-auth/plugins";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { DEV_LAN_ORIGINS } from "@/lib/dev-origins";
import { getEnv } from "@/lib/env";
import { isValidIranianMobile, normalizeIranianMobile } from "@/lib/mobile";
import { getOtpConfig } from "@/lib/otp/config";
import { assertOtpConfigurationSafe, currentOtpEnvironment } from "@/lib/otp/environment";

import { otpPlugin } from "./otp-plugin";

/** Placeholder mail domain for accounts whose login identity is a mobile number. */
export const MOBILE_ACCOUNT_EMAIL_DOMAIN = "mobile.zangyar.local";

export function mobileAccountEmail(normalizedMobile: string) {
  return `${normalizedMobile}@${MOBILE_ACCOUNT_EMAIL_DOMAIN}`;
}

/** Any Drizzle database handle the adapter can write through, including a transaction. */
type AuthDatabase = Parameters<typeof drizzleAdapter>[0];

/**
 * The single Better Auth configuration.
 *
 * It is expressed as a function of the database handle so a caller can bind the
 * adapter to an open transaction. `getAuth()` passes the pooled database; teacher
 * provisioning passes its transaction so identity writes commit or roll back with
 * the domain rows they belong to. Without this, `internalAdapter.createUser`
 * would check out a different pooled connection and land outside the transaction.
 *
 * `transaction` is disabled for a transaction-bound handle: Drizzle's nested
 * transaction support is a savepoint on the same client, and the adapter only
 * needs it to wrap its own multi-statement writes.
 */
export function authOptions(database: AuthDatabase, overrides: { transaction?: boolean } = {}): BetterAuthOptions {
  const env = getEnv();

  // Fail startup on an unsafe OTP configuration. This runs here, in the single
  // configuration factory both `getAuth()` and `getAuthForTransaction()` use, so a
  // production deployment that tries to select the fixed-code development
  // provider is refused when the app boots rather than when someone first asks
  // for a code. A missing provider is not a startup failure — it is reported when
  // a code is actually requested.
  const otpConfig = getOtpConfig();
  assertOtpConfigurationSafe({
    ...currentOtpEnvironment(),
    provider: otpConfig.provider,
    fixedCode: otpConfig.fixedCode,
    hashSecret: otpConfig.hashSecret,
  });

  return {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    /**
     * Extra origins trusted for state-changing requests and redirects.
     *
     * Better Auth already trusts its own `baseURL` origin and appends this list, so
     * this only ever widens what is accepted. It is needed because testing on a
     * phone means the page's origin is the machine's LAN address rather than
     * `localhost`, and the library's CSRF check refuses an unrecognized `Origin`
     * with `403 Invalid origin` — which is what broke sign-out on the phone.
     *
     * Development only, and positively so: the list applies when `NODE_ENV` is
     * explicitly `development`, so a test run, a production build, or an unset
     * environment all fall back to trusting only `BETTER_AUTH_URL`. Trusting an
     * origin is exactly what CSRF protection tests against, so the default has to
     * be the strict one. The same list also feeds Next's `allowedDevOrigins`; see
     * `src/lib/dev-origins.ts`.
     */
    trustedOrigins: env.NODE_ENV === "development" ? [...DEV_LAN_ORIGINS] : [],
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
      usePlural: true,
      transaction: overrides.transaction ?? true,
    }),
    emailAndPassword: {
      enabled: true,
    },
    disabledPaths: [
      "/phone-number/send-otp",
      "/phone-number/verify",
      "/phone-number/request-password-reset",
      "/phone-number/reset-password",
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Canonicalize the submitted mobile before the plugin looks it up, so
        // every accepted spelling (+98, 0098, Persian digits) reaches the same
        // stored account. An unusable value is left untouched and refused by the
        // plugin's validator with a generic error.
        if (ctx.path !== "/sign-in/phone-number") return;
        const submitted = ctx.body?.phoneNumber;
        if (typeof submitted !== "string") return;
        const normalized = normalizeIranianMobile(submitted);
        if (normalized && isValidIranianMobile(normalized)) ctx.body.phoneNumber = normalized;
      }),
    },
    plugins: [
      phoneNumber({
        phoneNumberValidator: (value: string) => {
          if (typeof value !== "string") return false;
          return isValidIranianMobile(normalizeIranianMobile(value));
        },
        // A phone number must be verified before it can sign in. Verification
        // state is set by an authorized provisioning path (the development seed
        // marks the demo account verified, teacher provisioning marks a new
        // teacher verified).
        requireVerification: true,
        // The plugin's own OTP delivery stays a no-op and its four routes stay
        // disabled below. Verification by code is served by the zangyar-otp plugin
        // instead, because the plugin's storage is plaintext, purpose-less, and
        // has no resend cooldown. See docs/DECISIONS.md.
        sendOTP: () => {},
        signUpOnVerification: {
          getTempEmail: (value: string) => mobileAccountEmail(normalizeIranianMobile(value) ?? value),
          getTempName: (value: string) => normalizeIranianMobile(value) ?? value,
        },
      }),
      otpPlugin(),
    ],
  };
}

/**
 * Better Auth instance bound to a transaction.
 *
 * Used by provisioning flows that must create identity rows atomically with the
 * domain rows that reference them.
 */
export function getAuthForTransaction(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0]) {
  return betterAuth(authOptions(tx, { transaction: false }));
}

/**
 * The application-wide authentication instance.
 *
 * Better Auth owns global identity, password hashing, and session persistence;
 * domain membership remains the source of truth for school authorization.
 *
 * Login identity is the Iranian mobile number: the phone-number plugin supplies
 * `phone-number/sign-in` (password based) and the `phoneNumber` /
 * `phoneNumberVerified` user fields. Input is normalized and validated here so a
 * stored number always matches a lookup.
 *
 * OTP delivery is intentionally absent: no SMS provider exists yet, so the
 * OTP, verification, and phone-password-reset endpoints are disabled rather than
 * left reachable in a non-functional state. Email/password stays enabled for
 * existing accounts and tests; the product login surface is mobile-only.
 */
export function getAuth() {
  return betterAuth(authOptions(getDb()));
}
