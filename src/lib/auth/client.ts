"use client";

import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";

/**
 * Browser auth client.
 *
 * Login identity is the Iranian mobile number through the server's
 * phone-number plugin; email/password is intentionally not exposed here. The
 * client only calls the HTTP boundary — no domain logic lives in it, and every
 * authorization decision is still made server-side.
 */
export const authClient = createAuthClient({
  plugins: [phoneNumberClient()],
});

export const { signIn, signOut, useSession } = authClient;
