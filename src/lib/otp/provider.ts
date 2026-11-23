import type { OtpPurpose } from "./purpose";

/**
 * The delivery seam for one-time codes.
 *
 * Business logic depends on this interface, never on a specific SMS vendor, so a
 * real provider can be added later by implementing it and changing configuration
 * — no change to the OTP service, the teacher activation flow, or the UI.
 *
 * Note there is no separate `SmsProvider`: an SMS provider *is* an
 * implementation of this interface, and naming it twice would be one seam with
 * two names.
 */
export interface OtpProvider {
  /** Stable identifier recorded with each challenge, for operator visibility. */
  readonly name: string;

  /**
   * Produces the code to challenge with.
   *
   * The provider issues the code rather than the service, which is what lets the
   * Development provider return a configured fixed value while every other
   * provider returns a fresh random one. The service never inspects or branches
   * on the value, so "use a fixed code in development" needs no environment
   * check anywhere in business logic.
   */
  issueCode(): string;

  /**
   * Delivers the code.
   *
   * Returns a result instead of throwing, because a delivery failure is a
   * normal outcome the caller must handle (it has to withdraw the challenge it
   * just created) rather than an exception that skips cleanup.
   */
  send(request: OtpDeliveryRequest): Promise<OtpDeliveryResult>;
}

export type OtpDeliveryRequest = {
  /** Canonical `09XXXXXXXXX` form; a provider must not need to normalize it. */
  mobile: string;
  /** The plaintext code. Present here and nowhere else in the request. */
  code: string;
  purpose: OtpPurpose;
  expiresAt: Date;
  /** Non-secret message context, such as the school the code is for. */
  context?: { schoolName?: string | null };
};

export type OtpDeliveryResult =
  | { ok: true; providerName: string; providerMessageId?: string }
  | { ok: false; providerName: string; errorCategory: string; retryable: boolean };
