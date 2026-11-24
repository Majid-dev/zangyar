import "server-only";

import { and, count, desc, eq, gt, gte } from "drizzle-orm";

import { writeAuditEvent } from "@/lib/audit";
import { getOtpConfig, type OtpConfig } from "@/lib/otp/config";
import { hashOtpCode, otpExpiry, verifyOtpCode } from "@/lib/otp/code";
import type { OtpPurpose } from "@/lib/otp/purpose";
import type { OtpProvider } from "@/lib/otp/provider";
import { selectOtpProvider } from "@/lib/otp/selection";
import { getDb } from "@/lib/db";
import { otpChallenges } from "@/lib/db/schema";
import { normalizeIranianMobile } from "@/lib/mobile";

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Pick<Database, "select" | "insert" | "update">;

/**
 * A refusal the caller is expected to surface. Carries a stable English message
 * so `src/lib/actions/messages.ts` can translate it, and never distinguishes
 * "no such challenge" from "wrong code" from "expired" — that difference would be
 * an oracle.
 */
export class OtpError extends Error {
  constructor(
    public readonly code:
      | "INVALID_CODE"
      | "COOLDOWN"
      | "RATE_LIMITED"
      | "DELIVERY_FAILED"
      | "INVALID_MOBILE",
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "OtpError";
  }
}

/** One message for every verification failure, so responses cannot be probed. */
const GENERIC_INVALID = "This code is invalid or has expired.";

export type RequestOtpInput = {
  purpose: OtpPurpose;
  mobile: string;
  schoolId?: string | null;
  membershipId?: string | null;
  context?: { schoolName?: string | null };
  actorUserId?: string | null;
};

export type RequestOtpOptions = {
  provider?: OtpProvider;
  config?: OtpConfig;
  now?: Date;
  db?: Executor;
};

export type RequestOtpOutcome = {
  challengeId: string;
  expiresAt: Date;
  providerName: string;
};

function normalizeMobileOrThrow(mobile: string) {
  const normalized = normalizeIranianMobile(mobile);
  if (!normalized || !/^09\d{9}$/.test(normalized)) {
    throw new OtpError("INVALID_MOBILE", "The mobile number is not a valid Iranian mobile number.");
  }
  return normalized;
}

/**
 * Issues a one-time code for a purpose and delivers it through the configured
 * provider.
 *
 * The provider is resolved once here and handed to verification only implicitly —
 * verification reads the stored hash and the same secret, so it does not need the
 * provider at all.
 */
export async function requestOtp(input: RequestOtpInput, options: RequestOtpOptions = {}): Promise<RequestOtpOutcome> {
  const config = options.config ?? getOtpConfig();
  const provider = options.provider ?? selectOtpProvider(config);
  const now = options.now ?? new Date();
  const db = options.db ?? getDb();
  const mobile = normalizeMobileOrThrow(input.mobile);
  const policy = config.policies[input.purpose];

  // Cooldown: the most recent challenge for this purpose and number gates an
  // immediate re-request, so a sender cannot spam a number by retrying.
  const [latest] = await db
    .select({ createdAt: otpChallenges.createdAt })
    .from(otpChallenges)
    .where(and(eq(otpChallenges.purpose, input.purpose), eq(otpChallenges.phoneNumber, mobile)))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);

  if (latest) {
    const elapsedSeconds = (now.getTime() - latest.createdAt.getTime()) / 1000;
    if (elapsedSeconds < policy.resendCooldownSeconds) {
      const retryAfter = Math.ceil(policy.resendCooldownSeconds - elapsedSeconds);
      throw new OtpError("COOLDOWN", `A code was sent recently. Try again in ${retryAfter} seconds.`, retryAfter);
    }
  }

  // Rate limit across purposes: a number may only be challenged so often in a
  // window regardless of which flow is asking.
  const windowStart = new Date(now.getTime() - config.requestWindowSeconds * 1000);
  const [windowCount] = await db
    .select({ value: count() })
    .from(otpChallenges)
    .where(and(eq(otpChallenges.phoneNumber, mobile), gte(otpChallenges.createdAt, windowStart)));

  if ((windowCount?.value ?? 0) >= config.requestMax) {
    throw new OtpError("RATE_LIMITED", "Too many codes were requested for this number. Try again later.", config.requestWindowSeconds);
  }

  // Free the single-pending slot and invalidate any code already outstanding for
  // this purpose, so an older code can never be used after a resend.
  await db
    .update(otpChallenges)
    .set({ status: "REVOKED", revokedAt: now, updatedAt: now })
    .where(and(
      eq(otpChallenges.purpose, input.purpose),
      eq(otpChallenges.phoneNumber, mobile),
      eq(otpChallenges.status, "PENDING"),
    ));

  const code = provider.issueCode();
  const expiresAt = otpExpiry(now, policy.expirySeconds);

  const [challenge] = await db
    .insert(otpChallenges)
    .values({
      purpose: input.purpose,
      phoneNumber: mobile,
      codeHash: hashOtpCode(code, config.hashSecret),
      status: "PENDING",
      attemptCount: 0,
      maxAttempts: policy.maxAttempts,
      expiresAt,
      provider: provider.name,
      schoolId: input.schoolId ?? null,
      membershipId: input.membershipId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: otpChallenges.id });

  const delivery = await provider.send({
    mobile,
    code,
    purpose: input.purpose,
    expiresAt,
    context: input.context,
  });

  if (!delivery.ok) {
    // Withdraw the challenge: leaving a live code that nobody received would let
    // the sender retry straight into a cooldown while the recipient has nothing.
    await db
      .update(otpChallenges)
      .set({ status: "REVOKED", revokedAt: now, updatedAt: now })
      .where(eq(otpChallenges.id, challenge.id));

    throw new OtpError("DELIVERY_FAILED", "The verification code could not be sent.");
  }

  // Only audited when there is a real acting user. A public OTP request has no
  // actor, and `audit_logs.actor_user_id` is a foreign key to `users`, so
  // inventing a placeholder would either violate it or record a lie.
  if (input.actorUserId) {
    await writeAuditEvent(db, {
      schoolId: input.schoolId ?? null,
      actorUserId: input.actorUserId,
      action: "OTP_REQUESTED",
      entityType: "OTP_CHALLENGE",
      entityId: challenge.id,
      // No code, no hash, no secret: an audit trail must not be a way to obtain a
      // usable code.
      metadata: { purpose: input.purpose, provider: provider.name, expiresAt: expiresAt.toISOString() },
    });
  }

  return { challengeId: challenge.id, expiresAt, providerName: provider.name };
}

export type VerifyOtpInput = {
  purpose: OtpPurpose;
  mobile: string;
  code: string;
};

export type VerifyOtpOptions = {
  config?: OtpConfig;
  now?: Date;
  /**
   * Pass the caller's transaction so a *successful* verification joins its atomic
   * unit. Failure bookkeeping (attempt counters, expiry) is committed separately on
   * its own connection, because a caller that aborts on failure would otherwise
   * roll the counter back and hand out unlimited guesses.
   */
  tx?: Transaction;
};

export type VerifyOtpOutcome = {
  purpose: OtpPurpose;
  phoneNumber: string;
  schoolId: string | null;
  membershipId: string | null;
};

/**
 * Reads the live challenge for a purpose and number under a row lock.
 *
 * The lock is what makes a code strictly single-use: two concurrent submissions
 * cannot both observe a pending row and both succeed.
 */
async function lockPendingChallenge(executor: Transaction | ReturnType<typeof getDb>, purpose: OtpPurpose, mobile: string) {
  const [challenge] = await executor
    .select()
    .from(otpChallenges)
    .where(and(
      eq(otpChallenges.purpose, purpose),
      eq(otpChallenges.phoneNumber, mobile),
      eq(otpChallenges.status, "PENDING"),
    ))
    .limit(1)
    .for("update");
  return challenge ?? null;
}

/**
 * Verifies a code and consumes it.
 *
 * ## Why failures commit on their own connection
 *
 * A wrong code has to *persist* an incremented attempt counter. If that write
 * shared a transaction with a throw, the abort would roll the counter back and a
 * caller could guess indefinitely. So the attempt counter is committed through an
 * independent transaction, and only then is the failure raised.
 *
 * A successful verification is the opposite: the caller passes its transaction and
 * the consume joins it, so a later failure in the caller's flow restores the code.
 *
 * The lookup is keyed by purpose, so a code issued for one flow cannot satisfy
 * another.
 */
export async function verifyOtp(input: VerifyOtpInput, options: VerifyOtpOptions = {}): Promise<VerifyOtpOutcome> {
  const config = options.config ?? getOtpConfig();
  const now = options.now ?? new Date();
  const mobile = normalizeMobileOrThrow(input.mobile);

  const lookup = (executor: Transaction | ReturnType<typeof getDb>) =>
    lockPendingChallenge(executor, input.purpose, mobile);

  type RefusalReason = "ABSENT" | "EXPIRED" | "EXHAUSTED" | "MISMATCH";
  // A refusal carries the locked challenge when one was found, so the bookkeeping
  // can be applied by whoever handles the refusal rather than inside the aborted
  // transaction.
  type Refusal = { reason: RefusalReason; challenge?: typeof otpChallenges.$inferSelect };

  /**
   * Writes the state change for a failed attempt.
   *
   * Takes the locked challenge so the caller decides when it runs: on its own
   * connection for a standalone call, or inside the caller's transaction when one
   * is supplied.
   */
  const applyFailure = async (
    executor: Transaction | ReturnType<typeof getDb>,
    challenge: typeof otpChallenges.$inferSelect,
    reason: Refusal["reason"],
  ) => {
    if (reason === "EXPIRED") {
      await executor
        .update(otpChallenges)
        .set({ status: "REVOKED", revokedAt: now, updatedAt: now })
        .where(eq(otpChallenges.id, challenge.id));
      return;
    }

    if (reason === "EXHAUSTED") {
      await executor
        .update(otpChallenges)
        .set({ status: "EXHAUSTED", updatedAt: now })
        .where(eq(otpChallenges.id, challenge.id));
      return;
    }

    if (reason === "MISMATCH") {
      const attempts = challenge.attemptCount + 1;
      await executor
        .update(otpChallenges)
        .set({
          attemptCount: attempts,
          // Exhausting at the ceiling also frees the single-pending slot, so one more
          // guess cannot extend the brute-force budget by holding the row open.
          status: attempts >= challenge.maxAttempts ? "EXHAUSTED" : "PENDING",
          updatedAt: now,
        })
        .where(eq(otpChallenges.id, challenge.id));
    }
  };

  /**
   * Reads the challenge and, only on a match, consumes it.
   *
   * A refusal carries the locked challenge so the bookkeeping can be written by
   * whoever handles it, rather than here where the surrounding transaction is about
   * to abort and would discard the write.
   */
  const consume = async (tx: Transaction): Promise<VerifyOtpOutcome> => {
    const challenge = await lookup(tx);
    if (!challenge) throw { reason: "ABSENT" } satisfies Refusal;

    if (challenge.expiresAt.getTime() <= now.getTime()) throw { reason: "EXPIRED", challenge } satisfies Refusal;
    if (challenge.attemptCount >= challenge.maxAttempts) throw { reason: "EXHAUSTED", challenge } satisfies Refusal;
    if (!verifyOtpCode(input.code, challenge.codeHash, config.hashSecret)) throw { reason: "MISMATCH", challenge } satisfies Refusal;

    await tx
      .update(otpChallenges)
      .set({ status: "CONSUMED", consumedAt: now, updatedAt: now })
      .where(eq(otpChallenges.id, challenge.id));

    return {
      // The column is typed as the database enum, which retains legacy values the
      // application no longer accepts. Narrowing keeps the outcome honest: a row can
      // only have been written by a purpose the service itself allows.
      purpose: challenge.purpose as OtpPurpose,
      phoneNumber: challenge.phoneNumber,
      schoolId: challenge.schoolId,
      membershipId: challenge.membershipId,
    };
  };

  const raiseWithFailure = async (caught: unknown, executor: Transaction | null): Promise<never> => {
    const refusal = isRefusal(caught);
    if (!refusal) throw caught;
    if (!refusal.challenge) throw new OtpError("INVALID_CODE", GENERIC_INVALID);

    if (executor) {
      // Inside the caller's transaction: the write commits if the caller commits and
      // is discarded if it aborts. A caller that wants the ceiling to hold even when
      // it aborts must verify before opening its transaction.
      await applyFailure(executor, refusal.challenge, refusal.reason);
    } else {
      // Standalone: the failed read was already rolled back, so the bookkeeping is
      // reloaded under the lock and committed on its own connection.
      await getDb().transaction(async (tx) => {
        const fresh = await lookup(tx);
        if (fresh) await applyFailure(tx, fresh, refusal.reason);
      });
    }

    throw new OtpError("INVALID_CODE", GENERIC_INVALID);
  };

  if (options.tx) {
    try {
      return await consume(options.tx);
    } catch (caught) {
      return raiseWithFailure(caught, options.tx);
    }
  }

  try {
    return await getDb().transaction(consume);
  } catch (caught) {
    return raiseWithFailure(caught, null);
  }
}

function isRefusal(value: unknown): { reason: "ABSENT" | "EXPIRED" | "EXHAUSTED" | "MISMATCH"; challenge?: typeof otpChallenges.$inferSelect } | null {
  if (typeof value !== "object" || value === null || !("reason" in value)) return null;
  const reason = (value as { reason: unknown }).reason;
  if (reason !== "ABSENT" && reason !== "EXPIRED" && reason !== "EXHAUSTED" && reason !== "MISMATCH") return null;
  return value as { reason: "ABSENT" | "EXPIRED" | "EXHAUSTED" | "MISMATCH"; challenge?: typeof otpChallenges.$inferSelect };
}

/** Whether a live challenge exists, for UI affordances such as a resend timer. */
export async function hasPendingChallenge(options: { purpose: OtpPurpose; mobile: string; now?: Date }) {
  const mobile = normalizeIranianMobile(options.mobile);
  if (!mobile) return false;
  const now = options.now ?? new Date();
  const [row] = await getDb()
    .select({ id: otpChallenges.id })
    .from(otpChallenges)
    .where(and(
      eq(otpChallenges.purpose, options.purpose),
      eq(otpChallenges.phoneNumber, mobile),
      eq(otpChallenges.status, "PENDING"),
      gt(otpChallenges.expiresAt, now),
    ))
    .limit(1);
  return Boolean(row);
}
