"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/lib/auth/client";

/**
 * Sign-out control for the authenticated shell. The session cookie is cleared
 * by the auth server, so the redirect always lands on a real unauthenticated
 * state rather than a client-side illusion.
 */
export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSignOut() {
    if (pending) return;
    setPending(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onSignOut}
      disabled={pending}
      aria-busy={pending || undefined}
      className={`inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-wait disabled:opacity-60 ${className}`}
    >
      <span aria-hidden="true">⎋</span>
      {pending ? "در حال خروج…" : "خروج از حساب"}
    </button>
  );
}
