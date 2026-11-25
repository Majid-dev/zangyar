"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { clearActiveSchoolPreferenceAction } from "@/features/account/actions";
import { signOut } from "@/lib/auth/client";

/**
 * Ends the session, then leaves the browser on a real unauthenticated surface.
 *
 * Two things have to happen and both are the server's to do: Better Auth revokes
 * the session and clears its cookie, and the school preference this application
 * stores is dropped so a shared browser carries nothing into the next session.
 * The navigation waits for both, so the login page is never reached while a
 * session is still valid.
 */
export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function endSession() {
    if (pending) return;
    setPending(true);

    try {
      await signOut();
      await clearActiveSchoolPreferenceAction();
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return { endSession, pending };
}
