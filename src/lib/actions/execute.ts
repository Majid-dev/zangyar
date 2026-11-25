"use server";

import { ZodError } from "zod";

import { AuthorizationError } from "@/lib/auth/authorization-core";

import { safeLogMessage, toUserMessage } from "./messages";
import { actionFailure, actionSuccess, type ActionResult } from "./result";

export type ActionOperation<T> = () => Promise<T>;

function zodFailure(error: ZodError) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "form";
    fieldErrors[field] ??= [];
    if (!fieldErrors[field].includes(issue.message)) fieldErrors[field].push(issue.message);
  }
  return actionFailure("validation", "اطلاعات واردشده را بررسی کنید.", fieldErrors);
}

function errorKind(error: unknown) {
  if (error instanceof AuthorizationError) return "forbidden" as const;
  if (error instanceof Error && (error.message.includes("unique") || error.message.includes("overlap") || error.message.includes("already assigned"))) return "conflict" as const;
  return "server" as const;
}

/**
 * Failures the operator can correct, which are reported as validation input
 * rather than as a server fault. Matched by exact message so the classification
 * stays explicit and an unrelated error cannot drift into it.
 */
const ACTIONABLE_MESSAGES = new Set(["The current password is incorrect.", "This account has no password credential."]);

/** Execute a Server Action operation without leaking raw errors to the browser. */
export async function executeAction<T>(operation: ActionOperation<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await operation();
    return actionSuccess(data, successMessage);
  } catch (error) {
    if (error instanceof ZodError) return zodFailure(error);

    const translated = toUserMessage(error);
    if (!translated.known) console.error("Server action failed:", safeLogMessage(error));

    const kind = error instanceof Error && ACTIONABLE_MESSAGES.has(error.message) ? "validation" : errorKind(error);
    return actionFailure(kind, translated.message);
  }
}
