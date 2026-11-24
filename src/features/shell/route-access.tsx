import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

import { accessStateFor, type AccessState } from "@/components/layout/access-state";
import { getAuth } from "@/lib/auth";
import { AuthorizationError, requireSchoolRole, type ActiveSchoolMembership } from "@/lib/auth/authorization";

export type PageAccess =
  | { blocked: React.ReactElement; headers: Headers; context: null }
  | { blocked: null; headers: Headers; context: ActiveSchoolMembership };

export class SchoolContextError extends Error {
  constructor(public readonly reason: "UNAUTHENTICATED" | "NO_SCHOOL") {
    super(reason);
    this.name = "SchoolContextError";
  }
}

/**
 * Resolves the authenticated user's verified school context once per request.
 * `cache` dedupes the session and membership lookups across the layout and the
 * page, so role gating stays in one place without extra database round trips.
 *
 * Several memberships are no longer a dead end: `requireSchoolRole` selects among
 * them using the persisted preference, so only "authenticated but no active
 * membership anywhere" reaches `NO_SCHOOL`.
 */
export const getSchoolContext = cache(async (): Promise<ActiveSchoolMembership> => {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });

  if (!session?.user) throw new SchoolContextError("UNAUTHENTICATED");

  try {
    return await requireSchoolRole({ headers: requestHeaders, roles: ["SCHOOL_ADMIN", "TEACHER"] });
  } catch (error) {
    if (error instanceof AuthorizationError && error.code === "UNAUTHENTICATED") throw new SchoolContextError("UNAUTHENTICATED");
    throw new SchoolContextError("NO_SCHOOL");
  }
});

/**
 * Page-level gate. Authentication and school membership are guaranteed by the
 * `(app)` layout; this adds the per-page role requirement and returns the
 * already-resolved context instead of re-querying it.
 */
export async function requirePageAccess(roles?: readonly ("SCHOOL_ADMIN" | "TEACHER")[]): Promise<PageAccess> {
  const requestHeaders = await headers();
  let context: ActiveSchoolMembership;

  try {
    context = await getSchoolContext();
  } catch (error) {
    const reason = error instanceof SchoolContextError ? error.reason : "NO_SCHOOL";
    return { blocked: accessStateFor(reason), headers: requestHeaders, context: null };
  }

  if (roles && !roles.includes(context.role)) {
    return {
      blocked: accessStateFor(context.role === "TEACHER" ? "FORBIDDEN" : "NO_SCHOOL"),
      headers: requestHeaders,
      context: null,
    };
  }

  return { blocked: null, headers: requestHeaders, context };
}

export type { AccessState };
