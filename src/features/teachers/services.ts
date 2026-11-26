import "server-only";

import { and, eq } from "drizzle-orm";

import { writeAuditEvent } from "@/lib/audit";
import { getAuthForTransaction, mobileAccountEmail } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { accounts, academicYears, schoolMemberships, schools, teacherProfiles, teacherRegistrations, teacherWeeklyHourRequirements, users } from "@/lib/db/schema";
import { normalizeIranianMobile } from "@/lib/mobile";
import { requestOtp, verifyOtp } from "@/features/otp/service";

import { MISSING_HOURS_ON_APPROVAL_MESSAGE, NO_ACTIVE_YEAR_MESSAGE, isSchedulable } from "./hours";
import { requireTeacherManagementAccess } from "./policy";
import {
  completeTeacherRegistrationSchema,
  deleteRegistrationSchema,
  registerTeacherMobileSchema,
  setTeacherStatusSchema,
  setTeacherWeeklyHoursSchema,
  updateRegistrationMobileSchema,
  updateTeacherSchema,
  type CompleteTeacherRegistrationInput,
  type RegisterTeacherMobileInput,
  type SetTeacherStatusInput,
  type SetTeacherWeeklyHoursInput,
  type UpdateRegistrationMobileInput,
  type UpdateTeacherInput,
} from "./schema";
import { canTransitionTeacherStatus, teacherDecisionFor, type MembershipStatus } from "./status";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type AuthContext = Awaited<ReturnType<typeof getAuthForTransaction>["$context"]>;

const DUPLICATE_ROW = "23505";

/** Postgres unique-violation code, unwrapping Drizzle's query-error envelope. */
function postgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Everything the driver knows about a failure, flattened so a caller can match on a constraint name. */
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

/** Maps a database write failure onto a domain sentence. */
function databaseConflict(error: unknown, fallback: string): never {
  if (postgresErrorCode(error) === DUPLICATE_ROW) {
    const detail = postgresErrorDetail(error);
    if (detail.includes("teacher_registrations_school_phone_unique")) {
      throw new Error("This mobile number is already registered at this school.");
    }
    if (detail.includes("teacher_profiles_school_personnel_code_unique")) {
      throw new Error("Personnel code is already in use at this school.");
    }
    if (detail.includes("school_memberships_school_user_unique")) {
      throw new Error("This person already belongs to this school.");
    }
    if (detail.includes("user_phone_number_unique")) {
      throw new Error("This mobile number already belongs to another account.");
    }
    throw new Error("A record with these unique values already exists.");
  }
  throw error instanceof Error ? error : new Error(fallback);
}

/** Runs a flow inside one transaction with a Better Auth instance bound to it. */
async function withProvisioningTransaction<T>(operation: (tx: Transaction, authContext: AuthContext) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    const auth = getAuthForTransaction(tx);
    return operation(tx, await auth.$context);
  });
}

/**
 * Verifies a registration code.
 *
 * Runs *before* the transaction below, on purpose. Verifying inside it would mean a
 * wrong code's incremented attempt counter is rolled back with the abort, handing
 * out unlimited guesses; committing the counter from a second connection while the
 * transaction holds the row lock would deadlock. Verifying first makes the ceiling
 * real and keeps the transaction short.
 */
async function assertRegistrationCode(mobile: string, code: string) {
  try {
    await verifyOtp({ purpose: "TEACHER_REGISTRATION", mobile, code });
  } catch {
    throw new Error("The verification code is invalid or has expired.");
  }
}

/** Resolves a registration by id, anchored on the verified school. */
async function resolveRegistration(tx: Transaction, schoolId: string, registrationId: string) {
  const [row] = await tx
    .select()
    .from(teacherRegistrations)
    .where(and(eq(teacherRegistrations.id, registrationId), eq(teacherRegistrations.schoolId, schoolId)))
    .limit(1);
  return row ?? null;
}

/**
 * Resolves the membership created for a registration.
 *
 * The membership is reached through the registration row rather than trusted from
 * input, so an admin can only ever act on their own school's teacher.
 */
async function resolveRegistrationMembership(tx: Transaction, schoolId: string, registrationId: string) {
  const [row] = await tx
    .select({
      registration: teacherRegistrations,
      membershipId: schoolMemberships.id,
      userId: schoolMemberships.userId,
      role: schoolMemberships.role,
      status: schoolMemberships.status,
    })
    .from(teacherRegistrations)
    .innerJoin(schoolMemberships, eq(schoolMemberships.id, teacherRegistrations.membershipId))
    .where(and(
      eq(teacherRegistrations.id, registrationId),
      eq(teacherRegistrations.schoolId, schoolId),
      // Belt and braces: the composite FK already guarantees this, and repeating it
      // means a bug in the FK could not silently widen access.
      eq(schoolMemberships.schoolId, schoolId),
    ))
    .limit(1);
  return row ?? null;
}

/**
 * Writes one teacher's weekly obligation for one year, replacing any figure
 * already recorded.
 *
 * The upsert target is the table's own uniqueness — school, teacher, year — so two
 * concurrent corrections converge on one row instead of racing to insert a second.
 * Returns the stored figure rather than the input so callers report what the
 * database holds.
 */
async function upsertWeeklyHours(
  tx: Transaction,
  input: { schoolId: string; academicYearId: string; teacherMembershipId: string; requiredWeeklyHours: number },
) {
  const [row] = await tx
    .insert(teacherWeeklyHourRequirements)
    .values(input)
    .onConflictDoUpdate({
      target: [
        teacherWeeklyHourRequirements.schoolId,
        teacherWeeklyHourRequirements.teacherMembershipId,
        teacherWeeklyHourRequirements.academicYearId,
      ],
      set: { requiredWeeklyHours: input.requiredWeeklyHours, updatedAt: new Date() },
    })
    .returning({ requiredWeeklyHours: teacherWeeklyHourRequirements.requiredWeeklyHours });
  if (!row) throw new Error("The weekly hours could not be recorded.");
  return row.requiredWeeklyHours;
}

// ---------------------------------------------------------------------------
// School Admin: authorizing numbers
// ---------------------------------------------------------------------------

/**
 * Authorizes a mobile number to join the acting admin's school.
 *
 * No account, membership, or invitation is created: the admin is only asserting
 * "this number may join us". The person creates their own identity — and supplies
 * their own name and personnel code — when they register.
 */
export async function registerTeacherMobile(options: { headers: Headers; input: RegisterTeacherMobileInput }) {
  const context = await requireTeacherManagementAccess(options.headers);
  const input = registerTeacherMobileSchema.parse(options.input);
  const mobile = normalizeIranianMobile(input.mobile) ?? input.mobile;

  return getDb().transaction(async (tx) => {
    try {
      const [registration] = await tx
        .insert(teacherRegistrations)
        .values({
          schoolId: context.schoolId,
          phoneNumber: mobile,
          status: "PENDING",
          createdByUserId: context.userId,
        })
        .returning({ id: teacherRegistrations.id, phoneNumber: teacherRegistrations.phoneNumber });

      await writeAuditEvent(tx, {
        schoolId: context.schoolId,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        action: "TEACHER_REGISTRATION_CREATED",
        entityType: "TEACHER_REGISTRATION",
        entityId: registration.id,
        // The number is the record's own key; repeating it in metadata would put
        // contact details in the audit trail for no benefit. There is no other
        // detail on this row to report.
        metadata: {},
      });

      return { registrationId: registration.id };
    } catch (error) {
      databaseConflict(error, "The mobile number could not be registered.");
    }
  });
}

/**
 * Corrects the number while it is still unclaimed.
 *
 * Verified before the write rather than relying on the conditional update alone,
 * so the admin gets a sentence explaining *why* rather than a silent no-op. The
 * number is the teacher's login identity the moment they register, so changing it
 * afterwards would be an identity operation, not an authorization one.
 */
export async function updateRegistrationMobile(options: { headers: Headers; input: UpdateRegistrationMobileInput }) {
  const context = await requireTeacherManagementAccess(options.headers);
  const input = updateRegistrationMobileSchema.parse(options.input);
  const mobile = normalizeIranianMobile(input.mobile) ?? input.mobile;

  return getDb().transaction(async (tx) => {
    try {
      const registration = await resolveRegistration(tx, context.schoolId, input.registrationId);
      if (!registration) throw new Error("Teacher registration not found.");
      if (registration.status === "CLAIMED") {
        throw new Error("A registered teacher's mobile number cannot be changed here.");
      }
      // A legacy `REVOKED` row is no longer an invitation, so it can be deleted but
      // not corrected; correcting it would silently re-authorize the number.
      if (registration.status !== "PENDING") throw new Error("This registration can no longer be changed.");
      if (registration.phoneNumber === mobile) throw new Error("This is already the registered mobile number.");

      await tx
        .update(teacherRegistrations)
        .set({ phoneNumber: mobile, updatedAt: new Date() })
        .where(and(eq(teacherRegistrations.id, registration.id), eq(teacherRegistrations.schoolId, context.schoolId)));

      await writeAuditEvent(tx, {
        schoolId: context.schoolId,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        action: "TEACHER_REGISTRATION_MOBILE_UPDATED",
        entityType: "TEACHER_REGISTRATION",
        entityId: registration.id,
        metadata: {},
      });

      return { registrationId: registration.id };
    } catch (error) {
      databaseConflict(error, "The mobile number could not be updated.");
    }
  });
}

/**
 * Deletes an authorized-but-unclaimed number.
 *
 * A hard delete, not a status change: the record is the admin's own assertion
 * about a number nobody has claimed, so withdrawing it should leave nothing
 * behind — and nothing can be orphaned, because an unclaimed row has no
 * membership, no profile, and no account. The partial unique index excludes
 * `REVOKED`, so deleting also frees the number to be authorized again.
 *
 * Refused once claimed: at that point the person has an account, a membership,
 * and a profile, and ending their access is deactivation rather than deletion
 * (ADR-012). The audit event is written first, inside the same transaction, so the
 * record of the withdrawal survives the row it describes.
 */
export async function deleteRegistration(options: { headers: Headers; input: { registrationId: string } }) {
  const context = await requireTeacherManagementAccess(options.headers);
  const input = deleteRegistrationSchema.parse(options.input);

  return getDb().transaction(async (tx) => {
    const registration = await resolveRegistration(tx, context.schoolId, input.registrationId);
    if (!registration) throw new Error("Teacher registration not found.");
    if (registration.status === "CLAIMED") {
      throw new Error("A registered teacher cannot be deleted here. Deactivate them instead.");
    }

    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "TEACHER_REGISTRATION_DELETED",
      entityType: "TEACHER_REGISTRATION",
      entityId: registration.id,
      // The number is gone from the row it described, so the audit trail is the
      // only place it still exists. Recorded as a hash-free last-four form so the
      // trail can be matched to a complaint without storing a full number.
      metadata: { mobileLastFour: registration.phoneNumber.slice(-4) },
    });

    const deleted = await tx
      .delete(teacherRegistrations)
      .where(and(
        eq(teacherRegistrations.id, registration.id),
        eq(teacherRegistrations.schoolId, context.schoolId),
        // Compare-and-set on the status just read, so a concurrent registration
        // completing between the check and the delete cannot be destroyed.
        eq(teacherRegistrations.status, registration.status),
      ))
      .returning({ id: teacherRegistrations.id });

    if (deleted.length === 0) throw new Error("This registration changed while it was being deleted.");

    return { registrationId: registration.id };
  });
}

// ---------------------------------------------------------------------------
// School Admin: the single status transition
// ---------------------------------------------------------------------------

/**
 * Moves a teacher's access to a new membership status.
 *
 * Approval, rejection, deactivation, and reactivation are one operation: only
 * `ACTIVE` grants school access, so approving a pending registration *is*
 * activating the teacher, and undoing a rejection is the same transition. Keeping
 * them separate services meant three copies of the same guard, three audit action
 * names, and three places for the rules to drift apart; the rules now live in the
 * transition matrix in `./status` and are applied here once.
 *
 * Approval additionally records the teacher's mandatory weekly hours, in the same
 * transaction, because the two facts are one decision: an active teacher with no
 * obligation cannot be put on a timetable, so approving without a figure would
 * hand the admin a request they would immediately have to make again. A figure is
 * therefore required when the target is `ACTIVE` and the teacher does not already
 * have one — a reactivation keeps the obligation already on file rather than
 * asking for it a second time.
 *
 * The update is a compare-and-set on the status just read, so a concurrent
 * decision cannot be overwritten by a stale one — the loser gets a clear sentence
 * instead of silently winning.
 */
export async function setTeacherStatus(options: { headers: Headers; input: SetTeacherStatusInput }) {
  const context = await requireTeacherManagementAccess(options.headers);
  const input = setTeacherStatusSchema.parse(options.input);

  return getDb().transaction(async (tx) => {
    const resolved = await resolveRegistrationMembership(tx, context.schoolId, input.registrationId);
    if (!resolved) throw new Error("This teacher has not registered yet.");
    if (resolved.role !== "TEACHER") throw new Error("Teacher registration not found.");
    // A School Admin administers teachers, not their own access.
    if (resolved.userId === context.userId) throw new Error("A School Admin cannot change their own membership status.");

    const from = resolved.status as MembershipStatus;
    if (!canTransitionTeacherStatus(from, input.status)) {
      throw new Error(`Invalid teacher status transition: ${from} to ${input.status}.`);
    }

    // Into ACTIVE is the moment the obligation is established, so the year and any
    // existing figure are resolved only for that direction.
    let yearId: string | null = null;
    let existingHours: number | null = null;
    if (input.status === "ACTIVE") {
      const [year] = await tx
        .select({ id: academicYears.id })
        .from(academicYears)
        .where(and(eq(academicYears.schoolId, context.schoolId), eq(academicYears.status, "ACTIVE")))
        .limit(1);
      if (!year) throw new Error(NO_ACTIVE_YEAR_MESSAGE);
      yearId = year.id;
      const [existing] = await tx
        .select({ requiredWeeklyHours: teacherWeeklyHourRequirements.requiredWeeklyHours })
        .from(teacherWeeklyHourRequirements)
        .where(and(
          eq(teacherWeeklyHourRequirements.schoolId, context.schoolId),
          eq(teacherWeeklyHourRequirements.academicYearId, year.id),
          eq(teacherWeeklyHourRequirements.teacherMembershipId, resolved.membershipId),
        ))
        .limit(1);
      existingHours = existing?.requiredWeeklyHours ?? null;
      // Required only when nothing is on file. A reactivated teacher keeps the
      // figure they were given at approval.
      if (!isSchedulable(existingHours) && input.requiredWeeklyHours === undefined) {
        throw new Error(MISSING_HOURS_ON_APPROVAL_MESSAGE);
      }
    }

    const now = new Date();
    const updated = await tx
      .update(schoolMemberships)
      .set({
        status: input.status,
        suspendedAt: input.status === "SUSPENDED" ? now : null,
        // Never revoked: ending a teacher's access is suspension, and a rejected
        // registration is a decision the admin can still reverse from this screen.
        revokedAt: null,
        updatedAt: now,
      })
      .where(and(
        eq(schoolMemberships.id, resolved.membershipId),
        eq(schoolMemberships.schoolId, context.schoolId),
        eq(schoolMemberships.status, from),
      ))
      .returning({ id: schoolMemberships.id });

    if (updated.length === 0) throw new Error("Teacher status changed concurrently. Reload the page and try again.");

    // The hours are written after the status, inside the same transaction, so a
    // failure to record them cannot leave an approved teacher without an
    // obligation.
    let requiredWeeklyHours = existingHours;
    if (input.status === "ACTIVE" && yearId && input.requiredWeeklyHours !== undefined) {
      requiredWeeklyHours = await upsertWeeklyHours(tx, {
        schoolId: context.schoolId,
        academicYearId: yearId,
        teacherMembershipId: resolved.membershipId,
        requiredWeeklyHours: input.requiredWeeklyHours,
      });
    }

    const decision = teacherDecisionFor(from, input.status);
    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "TEACHER_STATUS_CHANGED",
      entityType: "SCHOOL_MEMBERSHIP",
      entityId: resolved.membershipId,
      metadata: {
        decision,
        from,
        to: input.status,
        targetUserId: resolved.userId,
        ...(requiredWeeklyHours === null ? {} : { requiredWeeklyHours }),
      },
    });

    return { registrationId: input.registrationId, status: input.status, decision, requiredWeeklyHours };
  });
}

/**
 * Records a teacher's mandatory weekly hours, or corrects an existing figure.
 *
 * Upserted rather than inserted, because the obligation is one number per teacher
 * per academic year: a second call is a correction of the same fact, and letting
 * two rows exist would make "what does this teacher owe" ambiguous.
 */
export async function setTeacherWeeklyHours(options: { headers: Headers; input: SetTeacherWeeklyHoursInput }) {
  const context = await requireTeacherManagementAccess(options.headers);
  const input = setTeacherWeeklyHoursSchema.parse(options.input);

  return getDb().transaction(async (tx) => {
    const resolved = await resolveRegistrationMembership(tx, context.schoolId, input.registrationId);
    if (!resolved) throw new Error("This teacher has not registered yet.");
    if (resolved.role !== "TEACHER") throw new Error("Teacher registration not found.");

    const [year] = await tx
      .select({ id: academicYears.id, name: academicYears.name })
      .from(academicYears)
      .where(and(eq(academicYears.schoolId, context.schoolId), eq(academicYears.status, "ACTIVE")))
      .limit(1);
    if (!year) throw new Error(NO_ACTIVE_YEAR_MESSAGE);

    const requiredWeeklyHours = await upsertWeeklyHours(tx, {
      schoolId: context.schoolId,
      academicYearId: year.id,
      teacherMembershipId: resolved.membershipId,
      requiredWeeklyHours: input.requiredWeeklyHours,
    });

    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "TEACHER_WEEKLY_HOURS_SET",
      entityType: "SCHOOL_MEMBERSHIP",
      entityId: resolved.membershipId,
      metadata: { academicYearId: year.id, requiredWeeklyHours, targetUserId: resolved.userId },
    });

    return { registrationId: input.registrationId, requiredWeeklyHours };
  });
}

/** Edits the details the teacher supplied, keeping the account name in step. */
export async function updateTeacher(options: { headers: Headers; input: UpdateTeacherInput }) {
  const context = await requireTeacherManagementAccess(options.headers);
  const input = updateTeacherSchema.parse(options.input);

  return withProvisioningTransaction(async (tx, authContext) => {
    try {
      const resolved = await resolveRegistrationMembership(tx, context.schoolId, input.registrationId);
      if (!resolved) throw new Error("This teacher has not registered yet.");

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

      // The profile and the account name are one fact; keep Better Auth's copy in
      // step so a session lookup never disagrees with the teacher list.
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

      return { registrationId: input.registrationId };
    } catch (error) {
      databaseConflict(error, "Teacher could not be updated.");
    }
  });
}

// ---------------------------------------------------------------------------
// Public registration (anonymous)
// ---------------------------------------------------------------------------

/**
 * Sends a registration code to a number a school has authorized.
 *
 * Returns whether a code was sent, but never which school authorized the number:
 * that is only revealed once the number is proven at completion. An unauthorized
 * number is reported as such rather than silently accepted, because the spec asks
 * the flow to prevent registration — see the tradeoff note in the plan.
 */
export async function requestTeacherRegistrationCode(options: { input: { mobile: string } }) {
  const parsed = registerTeacherMobileSchema.pick({ mobile: true }).parse({ mobile: options.input.mobile });
  const mobile = parsed.mobile as string;

  const authorizations = await getDb()
    .select({ id: teacherRegistrations.id })
    .from(teacherRegistrations)
    .where(and(
      eq(teacherRegistrations.phoneNumber, mobile),
      eq(teacherRegistrations.status, "PENDING"),
    ));

  if (authorizations.length === 0) return { sent: false as const };

  // Person-level challenge: the OTP proves the mobile, and school resolution
  // happens at completion, so no tenant is attached here.
  await requestOtp({ purpose: "TEACHER_REGISTRATION", mobile });

  return { sent: true as const };
}

export type CompletedRegistration = {
  userId: string;
  schoolNames: string[];
  alreadyRegistered: boolean;
};

/**
 * Completes registration: proves the number, creates the identity, and claims every
 * school that authorized it.
 *
 * Everything is one transaction, so a failure cannot leave a half-registered
 * identity. The client supplies no school: the authorizations are resolved from
 * the verified number, and a membership is created only for a school that actually
 * authorized it.
 */
export async function completeTeacherRegistration(options: { input: CompleteTeacherRegistrationInput }): Promise<CompletedRegistration> {
  const input = completeTeacherRegistrationSchema.parse(options.input);
  const mobile = normalizeIranianMobile(input.mobile) ?? input.mobile;

  // Proves the number and consumes the code before the transaction opens, so the
  // attempt ceiling holds and the transaction stays short.
  await assertRegistrationCode(mobile, input.code);

  // Ownership of the number is now established, so the rest can proceed. If it turns
  // out that no school authorized the number, the consumed code simply cannot be
  // reused, which is the correct outcome for someone probing an unauthorized number.
  return withProvisioningTransaction(async (tx, authContext) => {
    try {
      // Lock the authorizations so a concurrent completion cannot claim the same one twice.
      const authorizations = await tx
        .select({ id: teacherRegistrations.id, schoolId: teacherRegistrations.schoolId })
        .from(teacherRegistrations)
        .where(and(eq(teacherRegistrations.phoneNumber, mobile), eq(teacherRegistrations.status, "PENDING")))
        .for("update");

      if (authorizations.length === 0) throw new Error("No school has authorized this mobile number.");

      // One global identity per number: reuse an existing account rather than
      // duplicating the person.
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phoneNumber, mobile))
        .limit(1)
        .for("update");

      let userId: string;
      let alreadyRegistered = false;

      if (existing) {
        userId = existing.id;
        alreadyRegistered = true;
      } else {
        const created = await authContext.internalAdapter.createUser(
          {
            name: `${input.firstName} ${input.lastName}`,
            email: mobileAccountEmail(mobile),
            emailVerified: false,
            image: null,
            phoneNumber: mobile,
            // The number was proven by the code above, so it is verified. No
            // credential is linked here yet.
            phoneNumberVerified: true,
          },
          { method: "phone-number" },
        );
        userId = created.id;
      }

      // Link a credential only if the person does not already have one, so a second
      // registration at another school cannot silently reset a password.
      const [credential] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
        .limit(1);

      if (!credential) {
        await authContext.internalAdapter.linkAccount({
          userId,
          providerId: "credential",
          accountId: userId,
          password: await authContext.password.hash(input.password),
        });
      }

      const schoolNames: string[] = [];

      for (const authorization of authorizations) {
        const [existingMembership] = await tx
          .select({ id: schoolMemberships.id })
          .from(schoolMemberships)
          .where(and(eq(schoolMemberships.schoolId, authorization.schoolId), eq(schoolMemberships.userId, userId)))
          .limit(1);

        if (existingMembership) {
          // Already a member of that school (e.g. re-registering): leave the existing
          // membership's state alone and just mark this authorization claimed.
          await tx
            .update(teacherRegistrations)
            .set({ status: "CLAIMED", membershipId: existingMembership.id, claimedAt: new Date(), updatedAt: new Date() })
            .where(eq(teacherRegistrations.id, authorization.id));
          continue;
        }

        const [membership] = await tx
          .insert(schoolMemberships)
          .values({
            schoolId: authorization.schoolId,
            userId,
            // Hard-coded: the role is not an input, and every self-registration is a
            // teacher.
            role: "TEACHER",
            // Stated explicitly rather than relying on the column default: access
            // requires ACTIVE, and a registration must never start there.
            status: "PENDING_ADMIN_APPROVAL",
          })
          .returning({ id: schoolMemberships.id });

        await tx.insert(teacherProfiles).values({
          schoolId: authorization.schoolId,
          membershipId: membership.id,
          firstName: input.firstName,
          lastName: input.lastName,
          // Supplied by the teacher themselves. Applied at each authorizing school,
          // whose partial unique index still governs whether it is free there; a
          // clash surfaces as a conflict the person can act on by changing the code.
          personnelCode: input.personnelCode,
        });

        await tx
          .update(teacherRegistrations)
          .set({ status: "CLAIMED", membershipId: membership.id, claimedAt: new Date(), updatedAt: new Date() })
          .where(eq(teacherRegistrations.id, authorization.id));

        // Loaded for the completion message only; the school name is what the person
        // is told they are awaiting approval from.
        const [school] = await tx
          .select({ name: schools.name })
          .from(schools)
          .where(eq(schools.id, authorization.schoolId))
          .limit(1);
        if (school) schoolNames.push(school.name);
      }

      await writeAuditEvent(tx, {
        // Platform-level: this action may span several schools, so it is recorded
        // once against the person rather than duplicated per school.
        schoolId: null,
        actorUserId: userId,
        action: "TEACHER_REGISTRATION_COMPLETED",
        entityType: "USER",
        entityId: userId,
        metadata: { schoolCount: authorizations.length },
      });

      return { userId, schoolNames, alreadyRegistered };
    } catch (error) {
      databaseConflict(error, "Registration could not be completed.");
    }
  });
}
