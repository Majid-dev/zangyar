import "server-only";

import { and, eq } from "drizzle-orm";

import { writeAuditEvent } from "@/lib/audit";
import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { teacherProfiles, users } from "@/lib/db/schema";

import { joinDisplayName } from "./profile";
import { switchActiveSchoolSchema, updateOwnProfileSchema, type SwitchActiveSchoolInput, type UpdateOwnProfileInput } from "./schema";

/**
 * Updates the signed-in user's own display name.
 *
 * Three rows carry a name and they are written to agree:
 *
 *   - `user.firstName` / `user.lastName`, the account's own pair. Storing the pair
 *     is what makes this idempotent: the form is loaded from these two fields
 *     instead of being re-derived from `name` on every read, so saving an
 *     untouched form can no longer reorder a multi-word name.
 *   - `user.name`, the single display name Better Auth requires for the session.
 *   - the school-local `teacher_profiles` row for the *active* school, which is the
 *     copy the teacher list and an admin's edit form read. A teacher's profile is
 *     school-local (ADR-022), so only the school they are currently in is touched;
 *     their name at another school is that school's record to change.
 *
 * Nothing here accepts a user id, role, membership, mobile number, or status, so
 * a crafted form post cannot reach identity or authorization fields.
 */
export async function updateOwnProfile(options: {
  headers: Headers;
  input: UpdateOwnProfileInput;
}): Promise<{ name: string }> {
  const context = await requireSchoolAccess({ headers: options.headers });
  const input = updateOwnProfileSchema.parse(options.input);
  const name = joinDisplayName(input.firstName, input.lastName);

  await getDb().transaction(async (tx) => {
    await tx
      .update(users)
      .set({ name, firstName: input.firstName, lastName: input.lastName, updatedAt: new Date() })
      .where(eq(users.id, context.userId));

    if (context.role === "TEACHER") {
      // Scoped by membership *and* school, so a teacher can only ever rewrite the
      // profile that belongs to the school they are operating in.
      await tx
        .update(teacherProfiles)
        .set({ firstName: input.firstName, lastName: input.lastName, updatedAt: new Date() })
        .where(and(eq(teacherProfiles.membershipId, context.membershipId), eq(teacherProfiles.schoolId, context.schoolId)));
    }

    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "USER_PROFILE_UPDATED",
      entityType: "USER",
      entityId: context.userId,
    });
  });

  return { name };
}

/**
 * Validates that the user may enter the named school and resolves it.
 *
 * The check is the strict one — `requireSchoolAccess` with an explicit id — so a
 * request naming a school the user has no *active* membership in is refused with
 * `SCHOOL_ACCESS_DENIED` rather than quietly falling back to their current school.
 *
 * Persisting the choice is deliberately left to the caller: the preference is a
 * cookie, and writing it is an HTTP-boundary concern, so the service stays
 * callable without a request scope and testable on its own.
 */
export async function switchActiveSchool(options: {
  headers: Headers;
  input: SwitchActiveSchoolInput;
}): Promise<ActiveSchoolMembership> {
  const input = switchActiveSchoolSchema.parse(options.input);
  return requireSchoolAccess({ headers: options.headers, schoolId: input.schoolId });
}

export type PasswordChangeOutcome = { changed: true };

/**
 * Changes the signed-in user's password, re-authenticating with the current one.
 *
 * Delegated to Better Auth's own `/change-password`, which verifies the current
 * password against the stored hash and applies the same length rules registration
 * uses. Only the caller's own credential is reachable: the endpoint resolves the
 * account from the session, and no user id is accepted here.
 *
 * `revokeOtherSessions` is off, so the current session (and any other signed-in
 * device) keeps working. That is a deliberate choice rather than an oversight: the
 * endpoint mints a replacement session and needs to write its cookie, which a
 * Server Action cannot do for the caller, so revoking here would sign the user out
 * of the very session that made the request.
 */
export async function changeOwnPassword(options: {
  headers: Headers;
  currentPassword: string;
  newPassword: string;
}): Promise<PasswordChangeOutcome> {
  try {
    await getAuth().api.changePassword({
      headers: options.headers,
      body: {
        currentPassword: options.currentPassword,
        newPassword: options.newPassword,
        revokeOtherSessions: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Invalid password")) {
      throw new Error("The current password is incorrect.");
    }
    if (message.includes("Credential account not found")) {
      throw new Error("This account has no password credential.");
    }
    if (message.includes("Password too short")) {
      throw new Error("The new password is too short.");
    }
    throw error;
  }

  return { changed: true };
}
