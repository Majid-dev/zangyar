import "server-only";

import { and, eq, gt } from "drizzle-orm";

import { writeAuditEvent } from "@/lib/audit";
import { getAuthForTransaction, mobileAccountEmail } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { accounts, otpChallenges, schoolMemberships, schools, teacherInvitations, teacherProfiles, users } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { normalizeIranianMobile } from "@/lib/mobile";

import { verifyOtp } from "@/features/otp/service";

import { requireTeacherManagementAccess } from "./policy";
import {
  activateTeacherSchema,
  createTeacherSchema,
  resendTeacherInvitationSchema,
  revokeTeacherInvitationSchema,
  teacherTransitionSchema,
  updateTeacherMobileSchema,
  updateTeacherSchema,
  type ActivateTeacherInput,
  type CreateTeacherInput,
  type TeacherTransitionInput,
  type UpdateTeacherInput,
  type UpdateTeacherMobileInput,
} from "./schema";
import { generateInvitationToken, hashInvitationToken, invitationExpiry, invitationTtlHours } from "./tokens";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type AuthContext = Awaited<ReturnType<typeof getAuthForTransaction>["$context"]>;

export type IssuedInvitation = { id: string; token: string; expiresAt: Date; url: string };

export type CreateTeacherOutcome = {
  teacherId: string;
  membershipId: string;
  invitation: IssuedInvitation;
  /** The mobile already had a ZangYar account; no second identity was created. */
  existingAccount: boolean;
  /** A suspended or revoked membership at this school was restored rather than duplicated. */
  reactivated: boolean;
};

const DUPLICATE_ROW = "23505";

/** Postgres unique-violation code, unwrapping Drizzle's query-error envelope. */
function postgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  // Drizzle wraps driver failures in DrizzleQueryError and keeps the driver
  // error on `cause`, so the SQLSTATE is one level down rather than on the error
  // the caller catches.
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Everything the driver knows about a failure, flattened so a caller can match on
 * the offending constraint name.
 */
function postgresErrorDetail(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    const candidate = current as { message?: unknown; detail?: unknown; constraint?: unknown; cause?: unknown };
    for (const value of [candidate.message, candidate.detail, candidate.constraint]) {
      if (typeof value === "string") parts.push(value);
    }
    current = candidate.cause;
  }
  return parts.join(" | ");
}

/**
 * Maps a database write failure onto a domain sentence.
 *
 * A unique violation is disambiguated by which constraint fired, so the operator
 * is told the fact they can act on rather than a generic conflict.
 */
function databaseConflict(error: unknown, fallback: string): never {
  if (postgresErrorCode(error) === DUPLICATE_ROW) {
    if (postgresErrorDetail(error).includes("teacher_profiles_school_personnel_code_unique")) {
      throw new Error("Personnel code is already in use at this school.");
    }
    throw new Error("A record with these unique values already exists.");
  }
  throw error instanceof Error ? error : new Error(fallback);
}

/**
 * Runs a provisioning flow inside one transaction, with a Better Auth instance
 * bound to that same transaction.
 *
 * This matters: without it, `internalAdapter.createUser` would check out a
 * separate pooled connection and commit outside this transaction, so a later
 * failure would leave an orphan identity holding the mobile number.
 */
async function withProvisioningTransaction<T>(operation: (tx: Transaction, authContext: AuthContext) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    const auth = getAuthForTransaction(tx);
    return operation(tx, await auth.$context);
  });
}

function invitationUrl(token: string) {
  return `${getEnv().BETTER_AUTH_URL}/activate/${token}`;
}

/** Revokes every usable invitation for a membership, freeing the one-pending slot. */
async function revokePendingInvitations(tx: Transaction, schoolId: string, membershipId: string, revokedByUserId: string) {
  await tx
    .update(teacherInvitations)
    .set({ status: "REVOKED", revokedAt: new Date(), revokedByUserId, updatedAt: new Date() })
    .where(and(
      eq(teacherInvitations.schoolId, schoolId),
      eq(teacherInvitations.membershipId, membershipId),
      eq(teacherInvitations.status, "PENDING"),
    ));
}

async function issueInvitation(
  tx: Transaction,
  input: { schoolId: string; membershipId: string; actorUserId: string },
): Promise<IssuedInvitation> {
  // Free the partial-unique slot first so a resend is never blocked by the
  // invitation it is replacing.
  await revokePendingInvitations(tx, input.schoolId, input.membershipId, input.actorUserId);

  const token = generateInvitationToken();
  const expiresAt = invitationExpiry(new Date(), invitationTtlHours());

  const [invitation] = await tx
    .insert(teacherInvitations)
    .values({
      schoolId: input.schoolId,
      membershipId: input.membershipId,
      tokenHash: hashInvitationToken(token),
      status: "PENDING",
      expiresAt,
      createdByUserId: input.actorUserId,
    })
    .returning({ id: teacherInvitations.id });

  return { id: invitation.id, token, expiresAt, url: invitationUrl(token) };
}

async function findTeacherMembership(tx: Transaction, schoolId: string, userId: string) {
  const [membership] = await tx
    .select({
      id: schoolMemberships.id,
      role: schoolMemberships.role,
      status: schoolMemberships.status,
    })
    .from(schoolMemberships)
    .where(and(eq(schoolMemberships.schoolId, schoolId), eq(schoolMemberships.userId, userId)))
    .limit(1);
  return membership ?? null;
}

/**
 * Resolves a teacher from the profile id the routes and forms carry.
 *
 * `teacherId` is always `teacher_profiles.id`, so every teacher operation starts
 * here and every predicate is anchored on the verified school. A teacher of
 * another school simply does not resolve.
 */
async function resolveTeacherMembership(tx: Transaction, schoolId: string, teacherId: string) {
  const [row] = await tx
    .select({
      teacherId: teacherProfiles.id,
      membershipId: schoolMemberships.id,
      userId: schoolMemberships.userId,
      status: schoolMemberships.status,
    })
    .from(teacherProfiles)
    .innerJoin(schoolMemberships, eq(schoolMemberships.id, teacherProfiles.membershipId))
    .where(and(
      eq(teacherProfiles.id, teacherId),
      eq(teacherProfiles.schoolId, schoolId),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.role, "TEACHER"),
    ))
    .limit(1);
  return row ?? null;
}

/**
 * Resolves the teacher's user identity, creating it only when the mobile number
 * is genuinely new. An existing account is reused, never duplicated and never
 * modified: a person who already signs in to ZangYar keeps one identity.
 */
async function resolveTeacherIdentity(
  tx: Transaction,
  authContext: AuthContext,
  input: { mobile: string; firstName: string; lastName: string },
): Promise<{ userId: string; created: boolean }> {
  // Lock the identity row so two concurrent creates for the same existing user
  // cannot both read "no membership here" and then both insert one.
  const [existing] = await tx
    .select({ id: users.id, phoneNumberVerified: users.phoneNumberVerified })
    .from(users)
    .where(eq(users.phoneNumber, input.mobile))
    .limit(1)
    .for("update");

  if (existing) {
    if (!existing.phoneNumberVerified) {
      // Escalating an unrelated unverified account to a signable state is not
      // this flow's decision to make, so it refuses instead.
      throw new Error("This mobile number belongs to an account that cannot be activated.");
    }
    return { userId: existing.id, created: false };
  }

  const created = await authContext.internalAdapter.createUser(
    {
      name: `${input.firstName} ${input.lastName}`,
      email: mobileAccountEmail(input.mobile),
      emailVerified: false,
      image: null,
      phoneNumber: input.mobile,
      // Required: the phone-number plugin discards the number unless the
      // provisioning path asserts it is verified. No credential account is
      // linked, which is what makes the account unable to sign in until the
      // teacher completes activation.
      phoneNumberVerified: true,
    },
    { method: "phone-number" },
  );

  return { userId: created.id, created: true };
}

async function upsertTeacherProfile(
  tx: Transaction,
  input: { schoolId: string; membershipId: string; firstName: string; lastName: string; personnelCode: string | null },
) {
  const [profile] = await tx
    .insert(teacherProfiles)
    .values({
      schoolId: input.schoolId,
      membershipId: input.membershipId,
      firstName: input.firstName,
      lastName: input.lastName,
      personnelCode: input.personnelCode,
    })
    .onConflictDoUpdate({
      target: teacherProfiles.membershipId,
      set: {
        firstName: input.firstName,
        lastName: input.lastName,
        personnelCode: input.personnelCode,
        updatedAt: new Date(),
      },
    })
    .returning({ id: teacherProfiles.id });

  return profile.id;
}

/**
 * Creates a teacher account for the acting School Admin's school and issues a
 * one-time activation invitation.
 *
 * The teacher cannot sign in afterwards: the account exists with a verified
 * mobile number but no credential, and both enabled sign-in endpoints reject an
 * account with no credential. Activation is the only path that creates one.
 */
export async function createTeacher(options: { headers: Headers; input: CreateTeacherInput }): Promise<CreateTeacherOutcome> {
  const context = await requireTeacherManagementAccess(options.headers);
  const input = createTeacherSchema.parse(options.input);
  const mobile = normalizeIranianMobile(input.mobile) ?? input.mobile;

  return withProvisioningTransaction(async (tx, authContext) => {
    try {
      const identity = await resolveTeacherIdentity(tx, authContext, {
        mobile,
        firstName: input.firstName,
        lastName: input.lastName,
      });

      const existingMembership = await findTeacherMembership(tx, context.schoolId, identity.userId);
      let membershipId: string;
      let reactivated = false;

      if (existingMembership) {
        if (existingMembership.role !== "TEACHER") {
          // Never repurpose an administrator's membership, and never let this
          // path change a role.
          throw new Error("This mobile number belongs to an account with a different role at this school.");
        }
        if (existingMembership.status === "ACTIVE") {
          throw new Error("A teacher with this mobile number already belongs to this school.");
        }

        // Re-adding a previously suspended or revoked teacher restores the
        // existing membership. Inserting a new one would violate the
        // (school, user) uniqueness rule and dead-end the operator.
        await tx
          .update(schoolMemberships)
          .set({ status: "ACTIVE", suspendedAt: null, revokedAt: null, updatedAt: new Date() })
          .where(and(eq(schoolMemberships.id, existingMembership.id), eq(schoolMemberships.schoolId, context.schoolId)));

        membershipId = existingMembership.id;
        reactivated = true;
      } else {
        const [membership] = await tx
          .insert(schoolMemberships)
          .values({
            schoolId: context.schoolId,
            userId: identity.userId,
            // Hard-coded: the role is not an input.
            role: "TEACHER",
            status: "ACTIVE",
          })
          .returning({ id: schoolMemberships.id });

        membershipId = membership.id;
      }

      const teacherId = await upsertTeacherProfile(tx, {
        schoolId: context.schoolId,
        membershipId,
        firstName: input.firstName,
        lastName: input.lastName,
        personnelCode: input.personnelCode,
      });

      const [membershipRow] = await tx
        .select({ userId: schoolMemberships.userId })
        .from(schoolMemberships)
        .where(and(eq(schoolMemberships.id, membershipId), eq(schoolMemberships.schoolId, context.schoolId)))
        .limit(1);

      // The profile and the account name are one fact; keep Better Auth's copy
      // in step so a session lookup never disagrees with the teacher list.
      await authContext.internalAdapter.updateUser(identity.userId, {
        name: `${input.firstName} ${input.lastName}`,
      });

      const invitation = await issueInvitation(tx, {
        schoolId: context.schoolId,
        membershipId,
        actorUserId: context.userId,
      });

      await writeAuditEvent(tx, {
        schoolId: context.schoolId,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        action: "TEACHER_CREATED",
        entityType: "SCHOOL_MEMBERSHIP",
        entityId: membershipId,
        metadata: { targetUserId: membershipRow?.userId ?? identity.userId, reactivated, existingAccount: !identity.created },
      });

      await writeAuditEvent(tx, {
        schoolId: context.schoolId,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        action: "TEACHER_INVITATION_CREATED",
        entityType: "TEACHER_INVITATION",
        entityId: invitation.id,
        // The plaintext token is deliberately absent: an audit trail must not
        // be a way to obtain an activation link.
        metadata: { membershipId, expiresAt: invitation.expiresAt.toISOString() },
      });

      return {
        teacherId,
        membershipId,
        invitation,
        existingAccount: !identity.created,
        reactivated,
      };
    } catch (error) {
      databaseConflict(error, "Teacher could not be created.");
    }
  });
}

export async function updateTeacher(options: { headers: Headers; input: UpdateTeacherInput }) {
  const context = await requireTeacherManagementAccess(options.headers);
  const input = updateTeacherSchema.parse(options.input);

  return withProvisioningTransaction(async (tx, authContext) => {
    try {
      const resolved = await resolveTeacherMembership(tx, context.schoolId, input.teacherId);
      if (!resolved) throw new Error("Teacher not found.");

      const [profile] = await tx
        .update(teacherProfiles)
        .set({
          firstName: input.firstName,
          lastName: input.lastName,
          personnelCode: input.personnelCode,
          updatedAt: new Date(),
        })
        .where(and(eq(teacherProfiles.membershipId, resolved.membershipId), eq(teacherProfiles.schoolId, context.schoolId)))
        .returning({ id: teacherProfiles.id });

      if (!profile) throw new Error("Teacher profile not found.");

      await authContext.internalAdapter.updateUser(resolved.userId, {
        name: `${input.firstName} ${input.lastName}`,
      });

      await writeAuditEvent(tx, {
        schoolId: context.schoolId,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        action: "TEACHER_UPDATED",
        entityType: "SCHOOL_MEMBERSHIP",
        entityId: resolved.membershipId,
        metadata: { targetUserId: resolved.userId },
      });

      return { teacherId: profile.id };
    } catch (error) {
      databaseConflict(error, "Teacher could not be updated.");
    }
  });
}

/**
 * Corrects the mobile number of a teacher who has not activated yet.
 *
 * The mobile number *is* the login identity, so this is deliberately narrow: it is
 * allowed only while activation is outstanding (no credential account) and is
 * refused outright for an activated account, whose owner has since been told that
 * number and whose reset flow is addressed by it.
 *
 * The new number's verification state is derived here, never taken from input. A
 * number that already belongs to a verified account cannot be claimed — that would
 * silently hand this school a login to somebody else's identity — so the change is
 * refused. The replacement identity is created in an unverified state, which keeps
 * it unsignable until the teacher proves the number through the activation code,
 * so swapping the number never bypasses mobile verification.
 */
export async function updateTeacherMobile(options: { headers: Headers; input: UpdateTeacherMobileInput }) {
  const context = await requireTeacherManagementAccess(options.headers);
  const input = updateTeacherMobileSchema.parse(options.input);
  const mobile = normalizeIranianMobile(input.mobile) ?? input.mobile;

  // No auth context is needed: the change writes only domain columns and never goes
  // through Better Auth's user-update path, which would clear an unverified phone.
  return withProvisioningTransaction(async (tx) => {
    try {
      const resolved = await resolveTeacherMembership(tx, context.schoolId, input.teacherId);
      if (!resolved) throw new Error("Teacher not found.");

      // Lock the identity being replaced so a concurrent activation cannot slip in
      // between the checks below and the swap.
      const [current] = await tx
        .select({ id: users.id, phoneNumber: users.phoneNumber })
        .from(users)
        .where(eq(users.id, resolved.userId))
        .limit(1)
        .for("update");

      if (!current) throw new Error("Teacher not found.");

      if (current.phoneNumber === mobile) {
        throw new Error("This is already the teacher's mobile number.");
      }

      // Only an un-activated account may have its number corrected.
      const [credential] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(
          eq(accounts.userId, resolved.userId),
          eq(accounts.providerId, "credential"),
          eq(accounts.accountId, resolved.userId),
        ))
        .limit(1);

      if (credential) throw new Error("An activated teacher's mobile number cannot be changed.");

      const [claimed] = await tx
        .select({ id: users.id, phoneNumberVerified: users.phoneNumberVerified })
        .from(users)
        .where(eq(users.phoneNumber, mobile))
        .limit(1)
        .for("update");

      if (claimed) {
        // Reclaiming an existing identity would either duplicate a person or grant
        // access to another tenant's account, and escalating an unverified one is
        // not this flow's decision.
        throw new Error("This mobile number already belongs to another account.");
      }

      // Better Auth's own update path clears an unverified phone, so the value is
      // written directly inside this transaction and the verification flag is set
      // explicitly. The new identity stays unverified until activation proves it.
      // The placeholder email is derived from the number, so it moves with it; if it
      // is somehow taken, the unique constraint rejects the change rather than
      // leaving the row pointing at the old number.
      await tx
        .update(users)
        .set({
          phoneNumber: mobile,
          phoneNumberVerified: false,
          email: mobileAccountEmail(mobile),
          updatedAt: new Date(),
        })
        .where(eq(users.id, resolved.userId));

      // The outstanding invitation was addressed to the old number's challenge, so
      // it is withdrawn. Any code already issued for the old number is revoked with
      // it, which is what stops the previous holder from completing activation.
      await revokePendingInvitations(tx, context.schoolId, resolved.membershipId, context.userId);
      await tx
        .update(otpChallenges)
        .set({ status: "REVOKED", revokedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(otpChallenges.phoneNumber, current.phoneNumber ?? ""),
          eq(otpChallenges.status, "PENDING"),
        ));

      const invitation = await issueInvitation(tx, {
        schoolId: context.schoolId,
        membershipId: resolved.membershipId,
        actorUserId: context.userId,
      });

      await writeAuditEvent(tx, {
        schoolId: context.schoolId,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        action: "TEACHER_MOBILE_UPDATED",
        entityType: "SCHOOL_MEMBERSHIP",
        entityId: resolved.membershipId,
        // The old and new numbers are deliberately absent: an audit trail should not
        // accumulate contact details, and the change is already attributable.
        metadata: { targetUserId: resolved.userId, invitationId: invitation.id },
      });

      return { teacherId: resolved.teacherId, invitation };
    } catch (error) {
      databaseConflict(error, "The teacher's mobile number could not be updated.");
    }
  });
}

/**
 * Deactivates or reactivates a teacher by changing membership status.
 *
 * Suspension is the deactivation mechanism because every authorization check
 * reads ACTIVE membership: an inactive teacher immediately loses access.
 */
export async function setTeacherMembershipStatus(options: { headers: Headers; input: TeacherTransitionInput }) {
  const context = await requireTeacherManagementAccess(options.headers);
  const input = teacherTransitionSchema.parse(options.input);

  return getDb().transaction(async (tx) => {
    const resolved = await resolveTeacherMembership(tx, context.schoolId, input.teacherId);
    if (!resolved) throw new Error("Teacher not found.");
    if (resolved.userId === context.userId) throw new Error("A School Admin cannot change their own membership status.");

    await tx
      .update(schoolMemberships)
      .set({
        status: input.status,
        suspendedAt: input.status === "SUSPENDED" ? new Date() : null,
        revokedAt: input.status === "REVOKED" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(schoolMemberships.id, resolved.membershipId), eq(schoolMemberships.schoolId, context.schoolId)));

    // A deactivated teacher cannot complete activation, so any live invitation
    // is withdrawn rather than left as a usable link.
    if (input.status !== "ACTIVE") {
      await revokePendingInvitations(tx, context.schoolId, resolved.membershipId, context.userId);
    }

    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "MEMBERSHIP_STATUS_CHANGED",
      entityType: "SCHOOL_MEMBERSHIP",
      entityId: resolved.membershipId,
      metadata: { status: input.status, targetUserId: resolved.userId },
    });

    return { membershipId: resolved.membershipId, status: input.status };
  });
}

/** Reissues an activation link, invalidating every previous token. */
export async function resendTeacherInvitation(options: { headers: Headers; input: { teacherId: string } }) {
  const context = await requireTeacherManagementAccess(options.headers);
  const input = resendTeacherInvitationSchema.parse(options.input);

  return withProvisioningTransaction(async (tx) => {
    const resolved = await resolveTeacherMembership(tx, context.schoolId, input.teacherId);
    if (!resolved) throw new Error("Teacher not found.");
    if (resolved.status !== "ACTIVE") throw new Error("School membership is not active.");

    // Re-inviting an account that already has a credential would hand out a
    // second way to set a password the teacher did not ask for.
    const [credential] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(
        eq(accounts.userId, resolved.userId),
        eq(accounts.providerId, "credential"),
        eq(accounts.accountId, resolved.userId),
      ))
      .limit(1);

    if (credential) throw new Error("An activated teacher cannot be invited again.");

    const invitation = await issueInvitation(tx, {
      schoolId: context.schoolId,
      membershipId: resolved.membershipId,
      actorUserId: context.userId,
    });

    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "TEACHER_INVITATION_RESENT",
      entityType: "TEACHER_INVITATION",
      entityId: invitation.id,
      metadata: { membershipId: resolved.membershipId, expiresAt: invitation.expiresAt.toISOString() },
    });

    return invitation;
  });
}

/** Revokes the usable invitation for a teacher without touching their account. */
export async function revokeTeacherInvitation(options: { headers: Headers; input: { teacherId: string } }) {
  const context = await requireTeacherManagementAccess(options.headers);
  const input = revokeTeacherInvitationSchema.parse(options.input);

  return getDb().transaction(async (tx) => {
    const resolved = await resolveTeacherMembership(tx, context.schoolId, input.teacherId);
    if (!resolved) throw new Error("Teacher not found.");

    const revoked = await tx
      .update(teacherInvitations)
      .set({ status: "REVOKED", revokedAt: new Date(), revokedByUserId: context.userId, updatedAt: new Date() })
      .where(and(
        eq(teacherInvitations.schoolId, context.schoolId),
        eq(teacherInvitations.membershipId, resolved.membershipId),
        eq(teacherInvitations.status, "PENDING"),
      ))
      .returning({ id: teacherInvitations.id });

    if (revoked.length === 0) throw new Error("There is no pending invitation for this teacher.");

    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "TEACHER_INVITATION_REVOKED",
      entityType: "TEACHER_INVITATION",
      entityId: revoked[0].id,
      metadata: { membershipId: resolved.membershipId },
    });

    return { ids: revoked.map((row) => row.id) };
  });
}

/**
 * Completes activation from a public activation link.
 *
 * The caller is anonymous and supplies only a token and a password: school,
 * user, and role are all derived from the token row, so no client value is ever
 * trusted as authorization. Consuming the token and linking the credential share
 * one transaction, so a failure cannot leave the teacher locked out of a token
 * that has already been spent.
 */
export async function activateTeacher(options: { input: ActivateTeacherInput }) {
  const input = activateTeacherSchema.parse(options.input);
  const tokenHash = hashInvitationToken(input.token);

  return withProvisioningTransaction(async (tx, authContext) => {
    // Resolve the invitation first, without consuming it, so the OTP can be
    // checked against the mobile number the invitation actually belongs to. That
    // number comes from the invitation row — never from the request, which
    // carries no mobile at all.
    const [pending] = await tx
      .select({
        id: teacherInvitations.id,
        schoolId: teacherInvitations.schoolId,
        membershipId: teacherInvitations.membershipId,
        mobile: users.phoneNumber,
      })
      .from(teacherInvitations)
      .innerJoin(schoolMemberships, eq(schoolMemberships.id, teacherInvitations.membershipId))
      .innerJoin(users, eq(users.id, schoolMemberships.userId))
      .where(and(
        eq(teacherInvitations.tokenHash, tokenHash),
        eq(teacherInvitations.status, "PENDING"),
        gt(teacherInvitations.expiresAt, new Date()),
      ))
      .limit(1);

    // Unknown, expired, revoked, and already-used tokens are one response, so the
    // endpoint cannot be used to probe which links exist.
    if (!pending || !pending.mobile) throw new Error("This activation link is invalid or has expired.");

    // Prove possession of the mobile number before anything is linked. Verification
    // joins this transaction, so a later failure restores the code as well as the
    // token rather than leaving the teacher with a spent code.
    try {
      await verifyOtp(
        { purpose: "TEACHER_ACTIVATION", mobile: pending.mobile, code: input.code },
        { tx },
      );
    } catch {
      // One message for every verification failure; the reason is not disclosed.
      throw new Error("The verification code is invalid or has expired.");
    }

    // Conditional update: the row is consumed only if it is still pending and
    // still within its lifetime, which makes single use atomic without a
    // read-then-write race.
    const [invitation] = await tx
      .update(teacherInvitations)
      .set({ status: "CONSUMED", consumedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(teacherInvitations.id, pending.id),
        eq(teacherInvitations.status, "PENDING"),
        gt(teacherInvitations.expiresAt, new Date()),
      ))
      .returning({
        id: teacherInvitations.id,
        schoolId: teacherInvitations.schoolId,
        membershipId: teacherInvitations.membershipId,
      });

    if (!invitation) throw new Error("This activation link is invalid or has expired.");

    const [membership] = await tx
      .select({
        id: schoolMemberships.id,
        userId: schoolMemberships.userId,
        role: schoolMemberships.role,
        status: schoolMemberships.status,
        schoolName: schools.name,
        schoolStatus: schools.status,
      })
      .from(schoolMemberships)
      .innerJoin(schools, eq(schools.id, schoolMemberships.schoolId))
      .where(and(
        eq(schoolMemberships.id, invitation.membershipId),
        eq(schoolMemberships.schoolId, invitation.schoolId),
      ))
      .limit(1);

    if (!membership || membership.role !== "TEACHER") throw new Error("This activation link is invalid or has expired.");
    if (membership.status !== "ACTIVE") throw new Error("School membership is not active.");
    if (membership.schoolStatus !== "ACTIVE") throw new Error("School is not operational.");

    const [existingCredential] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(
        eq(accounts.userId, membership.userId),
        eq(accounts.providerId, "credential"),
        eq(accounts.accountId, membership.userId),
      ))
      .limit(1);

    if (existingCredential) throw new Error("This teacher account is already activated.");

    await authContext.internalAdapter.linkAccount({
      userId: membership.userId,
      providerId: "credential",
      accountId: membership.userId,
      password: await authContext.password.hash(input.newPassword),
    });

    // Verification is a consequence of a completed activation: the teacher proved
    // the number by entering the code that was sent to it. This matters for an
    // account whose mobile was corrected while pending — that number was left
    // unverified precisely so the swap could not bypass verification, and this is
    // where it becomes verified. Signing in requires a verified phone, so without
    // this a renumbered teacher could never sign in even after activating.
    await tx
      .update(users)
      .set({ phoneNumberVerified: true, updatedAt: new Date() })
      .where(eq(users.id, membership.userId));

    await writeAuditEvent(tx, {
      schoolId: invitation.schoolId,
      // The teacher acts on their own account, so they are their own actor.
      actorUserId: membership.userId,
      actorMembershipId: membership.id,
      action: "TEACHER_ACTIVATED",
      entityType: "SCHOOL_MEMBERSHIP",
      entityId: membership.id,
      metadata: { invitationId: invitation.id },
    });

    return { userId: membership.userId, schoolName: membership.schoolName };
  });
}
