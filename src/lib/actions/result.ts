/**
 * Shared Server Action result contract.
 *
 * Server Actions return this union instead of throwing, so a client form can
 * distinguish validation failures from conflicts and unexpected server errors
 * and render the right feedback. Only `message` and `fieldErrors` cross the
 * boundary; stack traces and database details stay on the server.
 */

export type ActionErrorKind = "validation" | "conflict" | "forbidden" | "server";

export type ActionFieldErrors = Record<string, string[]>;

export type ActionSuccess<T> = {
  ok: true;
  data: T;
  message?: string;
};

export type ActionFailure = {
  ok: false;
  kind: ActionErrorKind;
  message: string;
  fieldErrors?: ActionFieldErrors;
};

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export type ActionState<T> = ActionResult<T> | null;

export function actionSuccess<T>(data: T, message?: string): ActionSuccess<T> {
  return { ok: true, data, message };
}

export function actionFailure(kind: ActionErrorKind, message: string, fieldErrors?: ActionFieldErrors): ActionFailure {
  return { ok: false, kind, message, ...(fieldErrors ? { fieldErrors } : {}) };
}

/** Narrowing helper usable on both sides of the boundary. */
export function isActionSuccess<T>(result: ActionResult<T> | null): result is ActionSuccess<T> {
  return result !== null && result.ok;
}

export function isActionFailure<T>(result: ActionResult<T> | null): result is ActionFailure {
  return result !== null && !result.ok;
}

/** First message recorded for a field, for rendering under an input. */
export function fieldErrorFor(failure: ActionFailure | null, field: string) {
  return failure?.fieldErrors?.[field]?.[0];
}
