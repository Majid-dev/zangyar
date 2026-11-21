/**
 * Superseded by the shared `(app)` layout and `@/features/shell/route-access`.
 * Kept as a re-export alias so nothing duplicates the authorization logic.
 * Delete this file (and its sibling access-state.tsx) once no import references remain.
 */
export { requirePageAccess, getSchoolContext, SchoolContextError, type PageAccess } from "@/features/shell/route-access";
