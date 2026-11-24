"use client";

/**
 * Browser client for the OTP endpoints.
 *
 * These are Better Auth plugin endpoints rather than Server Actions, because the
 * login call sets the session cookie on its own response. Kept as a small typed
 * helper so components do not hand-roll fetch calls or have to know the paths.
 */

type OtpPurpose = "TEACHER_REGISTRATION" | "LOGIN" | "PASSWORD_RESET";

type OtpResponse = { ok?: boolean; message?: string };

async function post(path: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // The session cookie must ride along and be stored, as for sign-in.
    credentials: "same-origin",
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as OtpResponse;
  return { status: response.status, ok: response.ok && payload.ok === true, message: payload.message };
}

/** Requests a code for a purpose. Always resolves, even when nothing was sent. */
export function requestOtpCode(input: { purpose: OtpPurpose; mobile: string }) {
  return post("/otp/request", input);
}

/** Verifies a LOGIN code and establishes a session. */
export function loginWithOtp(input: { mobile: string; code: string }) {
  return post("/otp/login", input);
}

/** Verifies a PASSWORD_RESET code and sets a new password. */
export function resetPasswordWithOtp(input: { mobile: string; code: string; newPassword: string }) {
  return post("/otp/reset-password", input);
}

/** Verifies a code without establishing a session. */
export function verifyOtpCode(input: { purpose: OtpPurpose; mobile: string; code: string }) {
  return post("/otp/verify", input);
}
