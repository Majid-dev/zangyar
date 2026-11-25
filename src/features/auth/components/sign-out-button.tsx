"use client";

import { useSignOut } from "./use-sign-out";

/**
 * Standalone sign-out control, for surfaces that are not the profile menu — the
 * access states shown when a session exists but no school can be entered.
 *
 * It shares the menu's sign-out path rather than calling the auth client
 * directly, so the session and the stored school preference are always cleared
 * together.
 */
export function SignOutButton({ className = "" }: { className?: string }) {
  const { endSession, pending } = useSignOut();

  return (
    <button
      type="button"
      onClick={endSession}
      disabled={pending}
      aria-busy={pending || undefined}
      className={`inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-wait disabled:opacity-60 ${className}`}
    >
      <span aria-hidden="true">⎋</span>
      {pending ? "در حال خروج…" : "خروج از حساب"}
    </button>
  );
}
