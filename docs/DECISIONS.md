# ZangYar Architecture Decisions

This file records product and architecture decisions for the initial MVP. Decisions marked **Proposed** require confirmation before schema implementation.

## ADR-001: Use a shared database with explicit tenant ownership

**Status:** Accepted

**Decision:** Use one PostgreSQL database and shared tables. `schools` is the tenant root, and every school-owned entity has an explicit `schoolId`.

**Rationale:** This keeps the initial deployment simple while making tenant boundaries visible in every query, mutation, index, and relationship. Composite foreign keys can enforce same-tenant relationships.

**Consequences:** All queries need tenant predicates and all domain services need verified tenant context. Database-level tenant isolation is complemented by server authorization; frontend filtering is never sufficient.

## ADR-002: Keep users global and model school access through memberships

**Status:** Accepted

**Decision:** Authentication users are global. `schoolMemberships` connects a user to one or more schools and carries school-level authorization.

**Rationale:** A teacher or administrator may work with multiple schools while retaining one login identity. Better Auth remains responsible for identity/session concerns; domain membership remains the source of truth for school business access.

**Decision:** A membership has exactly one role: `SCHOOL_ADMIN` or `TEACHER`. A user cannot hold both roles through one school membership.

## ADR-003: Keep Platform Admin separate from school roles

**Status:** Accepted

**Decision:** Platform Admin authorization is an explicit platform-level assignment, not a special school membership role.

**Rationale:** Platform operations span tenants and must not be granted accidentally by a school-level role.

**Consequences:** Platform-wide queries and routes require a separate authorization check and should be auditable.

## ADR-004: Treat guardians as contact records in the MVP

**Status:** Accepted

**Decision:** Guardians are school-owned contact records associated with students through `studentGuardians`. They do not authenticate and do not have a portal.

**Rationale:** The MVP's parent-facing capability is SMS delivery, not self-service access.

**Decision:** A non-null normalized guardian mobile number is unique within a school. A guardian without a mobile number cannot receive SMS. Consent and retention rules remain open.

## ADR-005: Make students school-local

**Status:** Accepted

**Decision:** A student belongs to one school-local record. Cross-school identity matching is not implemented in the MVP.

**Rationale:** This avoids introducing a global person identity and complex privacy/merging rules before they are needed.

**Decision:** National ID is optional. When provided, it is normalized and unique within the school; platform-wide uniqueness is not enforced.

## ADR-006: Bind classrooms and enrollments to academic years

**Status:** Accepted

**Decision:** Classrooms belong to an academic year. Enrollments connect students to a classroom within that year. Historical records remain tied to their original year.

**Rationale:** Academic-year transitions must not rewrite historical class and attendance context.

**Decision:** Classroom transfers are supported during an academic year. Enrollments include an inclusive start date and exclusive end date; transfers close the previous enrollment and create a new non-overlapping enrollment. Attendance remains linked to the enrollment effective on its business date.

## ADR-007: Use a daily attendance session with future lesson extensibility

**Status:** Accepted

**Decision:** Attendance is represented by `attendanceSessions` and `attendanceRecords`. The MVP creates one daily session per classroom and school-local date; `sessionKind` leaves room for future lesson-level sessions.

**Rationale:** The session/record split supports daily batch entry now and lesson or subject sessions later without changing student enrollment relationships.

**Decision:** No mandatory finalization step is included in the initial MVP. Teachers may correct same-day attendance for assigned classrooms; School Admins may correct attendance for any school date; every correction is audited. A later correction window or finalization workflow may be added without changing the core attendance model.

## ADR-008: Use a transactional notification outbox

**Status:** Accepted

**Decision:** Attendance transactions create notification outbox records in the same database transaction. A separate processor sends SMS and records provider attempts. School Admins configure which attendance statuses trigger SMS in the admin panel; the policy decision is snapshotted with each outbox item.

**Rationale:** Attendance submission must not wait for or fail because of an external SMS provider, while notification intent must not be lost after a successful attendance transaction.

**Consequences:** Outbox processing requires idempotency, retry classification, claiming behavior, and operational visibility.

## ADR-009: Start with a Mock SMS provider

**Status:** Accepted

**Decision:** Implement the provider boundary and Mock SMS Provider first. Do not select or integrate a real Iranian SMS provider until provider requirements are confirmed.

**Rationale:** Provider APIs, sender identity, delivery reports, pricing, and compliance requirements are not yet selected.

## ADR-010: Enforce same-tenant relationships in the database

**Status:** Accepted

**Decision:** Carry `schoolId` on school-owned join and dependent tables and use composite foreign keys where practical.

**Rationale:** Application checks can be bypassed by mistakes in query composition. Relational constraints provide a second line of defense against cross-tenant relationships.

**Consequences:** Schema definitions are more explicit and some foreign keys contain multiple columns. This is intentional for tenant safety.

## ADR-011: Store instants and business dates differently

**Status:** Accepted

**Decision:** Store instants as timezone-aware timestamps and school-local business dates as `date`. Resolve attendance day boundaries using each school's timezone, defaulting to `Asia/Tehran`.

**Rationale:** A daily attendance date is a school business concept, not a server-local timestamp. Separating the two prevents boundary errors.

**Decision:** User-facing forms may accept Persian-calendar dates, which are converted to Gregorian dates before storage.

## ADR-013: Tenant-safe student roster ownership

**Status:** Accepted

**Decision:** School Admins may manage all student, guardian, relationship, and enrollment records within their verified school. Teachers have read-only access through active, date-effective classroom assignments and receive projections without guardian mobile or national ID.

**Rationale:** Student records are school-owned, while classroom assignment is the teacher resource boundary. A student ID alone must never bypass assignment checks.

## ADR-014: Enforce non-overlapping enrollment ranges

**Status:** Accepted

**Decision:** Enrollment ranges use `[startDate, endDate)` semantics and are protected by a PostgreSQL exclusion constraint in addition to application validation. Relationship rows and enrollment history are retained through status/close transitions.

**Rationale:** Application checks provide useful domain errors, while the database constraint prevents concurrent classroom transfers from creating overlapping history.

## ADR-015: Coordinate academic-year closure with enrollment closure

**Status:** Accepted

**Decision:** Closing an academic year is one server-owned transaction. It changes the year to `CLOSED`, archives only active enrollments in that year at the year end, writes audit events, and leaves student global status, terminal enrollments, classes, and historical records unchanged. Closed/archived-year classrooms are hidden from operational lists and cannot be used for new class creation, teacher assignment, attendance, or enrollment.

**Concurrency and retries:** The status transition uses a compare-and-set guard. `CLOSED → CLOSED` remains a legal idempotent retry, but the enrollment sweep and its audit event run only on the real transition into `CLOSED`.

**Rationale:** Academic-year lifecycle and enrollment lifecycle stay separate data concepts while avoiding partial closure states and preserving historical reporting context.

## ADR-016: Reactivate profiles without reopening history

**Status:** Accepted

**Decision:** School Admins can explicitly reactivate `WITHDRAWN`, `GRADUATED`, or `ARCHIVED` student profiles after confirmation. Reactivation changes only `students.status`; it never reopens an enrollment, assigns a class, or changes historical records. The action remains tenant-scoped and uses the existing student transition service.

**Rationale:** A student's global profile lifecycle is distinct from academic-year enrollment history. Requiring explicit confirmation prevents accidental reactivation while keeping prior records immutable.

## ADR-017: Use a shared typed action/form boundary

**Status:** Accepted

**Decision:** Shared forms use `ActionResult`/`ActionState` for validation, safe server errors, field-level errors, pending state, duplicate-submit prevention, and success feedback. `ActionForm` supports caller callbacks for dirty-state and post-success UI updates. Relationship/contact edits that belong to one guardian profile submit through one existing edit action rather than separate relationship and contact saves.

**Rationale:** One submission boundary prevents partial UI saves, keeps server error details private, and makes form behavior consistent across the application.

## ADR-018: Keep visual controls reusable and dependency-free

**Status:** Accepted

**Decision:** Shared `Select` renders a branded accessible listbox while retaining a hidden native select for form submission. It uses rounded menus, Persian RTL alignment, primary selected state, and muted gray hover state. The Jalali picker and sidebar use dependency-free shared SVG/icon primitives rather than adding an icon package.

**Rationale:** Native option popup styling is OS/browser-controlled and inconsistent. A shared control gives ZangYar consistent radius, spacing, focus, hover, and selection treatment without introducing unnecessary dependencies.

## ADR-025: Register teachers by authorized mobile number, with admin approval

**Status:** Accepted (supersedes ADR-021)

**Decision:** A School Admin registers only a mobile number — no name, no account, no invitation. That row in `teacher_registrations` is a durable authorization: "this number may join us". The person then self-registers at a public page by entering the number, proving it with an OTP, and supplying their own name and password. Registration creates one global identity (reused if the number already has one) and, for every school that authorized the number, a `TEACHER` membership in `PENDING_ADMIN_APPROVAL` plus a `teacher_profile` carrying the supplied name. Access is granted only when the admin approves, which moves the membership to `ACTIVE`. Rejection moves it to `REJECTED`.

**Rationale:** Invitations inverted the wrong way round: the admin asserted a person's name before any account existed, and the delivery of a link was a manual step with nothing to send it. Registering the number instead means the school's only claim is the one it is actually entitled to make — that a number may join — and the person supplies their own identity. It also removes the invitation token entirely, along with the plaintext-link handling it required.

Placing the approval states on `membership_status` rather than a parallel column is what makes the gate trustworthy: every existing authorization path already filters `status = 'ACTIVE'`, so a pending or rejected teacher is denied everywhere without a single check being edited, and there is no path that could forget to consult a second table.

**Consequences:** `teacher_invitations` and its token helpers are removed; the drop is dependency-clean because nothing referenced that table. The registration row is durable rather than consumed, so an authorized-but-unclaimed number stays visible to the admin and the record of who authorized it survives. A number may be authorized once per school, enforced by a partial unique index; withdrawing an authorization on an unclaimed number deletes the row and frees the number to be re-added (see ADR-027). A mobile can be authorized by two schools, and registration then yields one identity with a pending membership at each. Mobile correction is allowed while the number is unclaimed and refused afterwards, because the number is the login identity once the person owns it. The personnel code is the teacher's to supply at registration rather than the admin's (see ADR-028). The registration OTP is verified before the completion transaction opens, so a wrong code's attempt counter is not rolled back with the transaction that rejects it.

## ADR-027: Treat teacher approval as the activation transition, not a separate workflow

**Status:** Accepted

**Decision:** Teacher management keeps exactly two storage axes and no more. `teacher_registrations.status` answers *authorization* — may this number register? — and runs `PENDING → CLAIMED`, terminal either way. `school_memberships.status` answers *access* — may this person use the school? — and carries `PENDING_ADMIN_APPROVAL`, `ACTIVE`, `REJECTED`, `SUSPENDED`. Because only `ACTIVE` grants access, approving a pending registration *is* activating the teacher, so approval, rejection, deactivation, and reactivation collapse into one service (`setTeacherStatus`) guarded by one transition matrix, with `ACTIVE → SUSPENDED` as deactivation and any return to `ACTIVE` as approval or reactivation. Withdrawing an unclaimed authorization deletes the registration row; withdrawing a claimed one is deactivation of the membership.

**Rationale:** Two columns exist because the two questions are genuinely different — an authorization can exist with no person attached to it, which is why the registration row and not the membership is the anchor — so merging them into one status column would conflate "may register" with "may access" and make an authorized-but-unclaimed number indistinguishable from a rejected teacher. The redundancy was not in storage but in vocabulary and code: three services (`approveTeacher`, `rejectTeacher`, `setTeacherMembershipStatus`) each re-derived the same legality question, three audit action names described one kind of event, and the UI offered a different control depending on which page you were on. One matrix means a state can only be reached by a move that was declared legal, and both surfaces render the actions that matrix derives instead of deciding for themselves.

Deleting rather than flagging an unclaimed authorization follows from what the row is: the admin's own assertion about a number nobody owns. There is no membership, profile, or account to orphan — verified by test rather than argued — so keeping a tombstone row would preserve nothing while still occupying the uniqueness slot. The audit event is written inside the same transaction, so the withdrawal outlives the row it describes. Once the number is claimed the row *is* the durable record of who authorized it, so it is retained and the access decision moves to the membership, consistent with ADR-012's archive-over-delete rule.

**Consequences:** `REJECTED` is reachable from `PENDING_ADMIN_APPROVAL` and recoverable through the same transition that approves a pending teacher; an `ACTIVE` teacher cannot be rejected, only deactivated, because rejection is a decision about a registration rather than a way to end access. `REVOKED` remains in the `teacher_registration_status` enum for rows withdrawn under the earlier model, and now only means "deletable but no longer correctable". Every write is a compare-and-set on the status just read, so concurrent decisions produce a reported conflict rather than a silent overwrite. The transition matrix is pure and unit-tested on its own, including that no transition ends where it started and that no loss of access is a one-way door.

## ADR-028: Keep the personnel code on the teacher's profile, supplied at registration

**Status:** Accepted

**Decision:** The personnel code is stored only on `teacher_profiles`, and it is supplied by the teacher in the public registration form rather than by the School Admin authorizing the number. `teacher_registrations` carries no name and no personnel code — only the number, its status, and the resulting membership. The field is optional, and a School Admin can correct it after registration from the teacher's page.

**Rationale:** The personnel code is a school-local employment attribute of the teacher, which is exactly what ADR-022 established `teacher_profiles` for. It was briefly duplicated onto `teacher_registrations` so the admin could set it while authorizing a number, but that row exists before any person does, and the admin is not entitled to assert a teacher's own employment details — the same reasoning that already kept the teacher's *name* out of the admin's form. Once the teacher supplies it, the registration copy has no reader left: both are written at the same moment, when registration creates the profile. Removing the column instead of leaving a dead duplicate is what keeps "the admin asserts only that a number may join" a property of the schema rather than a convention.

Leaving it optional matters because not every school issues personnel codes, and a required field would let such a school's configuration block its own teachers from registering. The per-school partial unique index still applies at registration, so a code already taken at one authorizing school surfaces as a conflict the person can resolve; that is the correct place for the check, because the code's uniqueness is a school-local fact.

**Consequences:** `teacher_registrations.personnel_code` is dropped, so a code that an admin had set on an *unclaimed* registration is discarded — it was an unconfirmed intent, not a fact, and nothing read it. Existing profiles keep their code, since it was already copied there at completion. Admin list search and sorting for the code now read the profile, which means an unregistered number no longer matches a personnel-code filter — it has no code yet. A wrong code is recoverable through the existing teacher edit form rather than requiring a database edit.

## ADR-026: Verify the registration OTP outside the completion transaction

**Status:** Accepted

**Decision:** `completeTeacherRegistration` verifies and consumes the OTP *before* opening its transaction, rather than inside it.

**Rationale:** The attempt counter must survive a rejected attempt, or the ceiling is meaningless. Attempting to write that counter from a second connection while the caller's transaction holds the row lock deadlocks, and writing it inside the transaction means the abort rolls it back. Verifying first is the only arrangement that both keeps the limit real and keeps the transaction short. The cost is that a code is consumed even when the subsequent transaction fails (for example, when no school authorized the number); that is acceptable because the failure mode is "the code is spent", which is the safe direction.

**Consequences:** A caller that verifies inside its own transaction still gets correct single-use behaviour, but the attempt ceiling holds only if that caller commits. Nothing in the application does this; the OTP service documents the constraint on `VerifyOtpOptions.tx`.

## ADR-021: Separate teacher invitation state from membership and identity state

**Status:** Superseded by ADR-025

**Decision:** A teacher is provisioned by a School Admin, never by self-registration. Provisioning creates or reuses the global user identity by normalized mobile number, creates a `TEACHER` membership in the acting admin's school, and issues a one-time activation invitation. Invitation state (`PENDING`, `REVOKED`, `CONSUMED`, plus a derived `EXPIRED`) is stored on `teacher_invitations` and is deliberately **not** folded into `school_memberships.status`, which keeps meaning school access (`ACTIVE`/`SUSPENDED`/`REVOKED`). The account is created with a verified mobile number and **no credential account**, and activation is the only path that links one.

**Rationale:** Membership state answers "may this person use the school?" and invitation state answers "has this person finished setting up?". Conflating them would make a person who never opened their invitation indistinguishable from one whose access was deliberately withdrawn, and it would force every existing authorization check to learn a new membership value. Keeping the credential absent until activation makes "cannot authenticate before activating" a property of the data rather than a condition someone has to remember to check.

**Consequences:** Both enabled sign-in endpoints refuse an account with no credential, so a provisioned teacher provably cannot sign in until activation; this is asserted by test rather than assumed. The token is stored only as a SHA-256 hash, is single-use through a conditional consume-and-link transaction, and is never written to the audit trail. Resending revokes every previous pending invitation, and a partial unique index enforces at most one usable invitation per membership. Because no SMS or email provider exists yet, the activation link is shown to the admin to pass along; a delivery integration can later consume the same link without changing this model.

## ADR-022: Model the teacher's school-local record separately from the membership

**Status:** Accepted

**Decision:** Teacher-specific attributes that only mean something within one school, currently the personnel code, live on a `teacher_profiles` row that is one-to-one with a school membership. The row carries an explicit `schoolId` constrained to the membership's school through a composite foreign key, and the profile's personnel code is unique within the school when present.

**Rationale:** The membership already expresses identity, role, and access, so adding teacher-only columns to it would put fields that are meaningless for a School Admin on every membership row. A separate record keeps each table's meaning unambiguous while preserving the invariant that the profile describes exactly one membership in exactly one school.

**Consequences:** Reads that show a teacher join the profile. Deactivation and reactivation continue to act on the membership, so the profile row is retained rather than deleted, consistent with the archive-over-delete rule. The database cannot express "this membership has the TEACHER role" through a foreign key, so that requirement stays enforced in the service layer, the same known gap already recorded for `class_teachers`.

## ADR-023: Make OTP challenges purpose-specific and store them keyed-hashed

**Status:** Accepted

**Decision:** One-time codes are held in `otp_challenges`, keyed by `purpose` (`TEACHER_ACTIVATION`, `LOGIN`, `PASSWORD_RESET`) as well as by normalized mobile number. Only a keyed hash of the code is stored: HMAC-SHA256 under a server-side secret, compared with `timingSafeEqual`. Challenges carry their own attempt ceiling, expiry, and resend cooldown, and may be linked to a school membership. Delivery goes through an `OtpProvider` interface selected by configuration, with a Development-only fixed-code provider for the MVP.

**Rationale:** Better Auth's phone-number plugin already implements OTP storage, but it stores the code in plaintext (`code:attempts` in the `verification` table), has no purpose concept, no resend cooldown, and no way to associate a challenge with a membership — so it cannot satisfy purpose-specific verification, per-purpose throttling, or tenant-scoped activation. Keeping a separate table also stops us depending on a third party's internal storage format.

The hash is keyed because the code space is small: a six-digit code has only 10^6 values, so an unkeyed digest would be exhaustible offline in milliseconds from a single leaked row. This is the opposite of the reasoning for invitation tokens in ADR-019's slice, which are 256-bit random values and therefore correctly stored under a plain SHA-256.

**Consequences:** Codes are never recoverable from the database, and the plaintext appears only in the provider's delivery call — in development, a single server-log line. Verification is single-use under a row lock, and a failed attempt commits its incremented counter on its own connection, because a counter written inside a transaction that then aborts would be rolled back and would allow unlimited guesses. Purposes are separated at the storage key, so a code issued for one flow cannot satisfy another.

## ADR-024: Refuse the fixed-code OTP provider in production

**Status:** Accepted

**Decision:** The Development OTP provider issues a configured fixed code. Provider selection is configuration-driven, and an unsafe configuration is refused before it can run: `development` in production throws unconditionally at startup, with no override; the reserved `sms` name throws rather than silently falling back; and a missing provider fails closed when a code is requested. When no provider is configured, the production default is `none`, which is tolerated at startup so an ordinary build and boot still succeed without OTP configuration.

**Rationale:** A fixed, publicly known verification code is exactly what makes local development workable and exactly what must never be reachable in production. The distinction between "unsafe configuration" (refuse at startup) and "no provider configured" (refuse at request time) is what keeps a production build honest without making it impossible to boot.

**Consequences:** `pnpm build` succeeds with no OTP variables set, while `OTP_PROVIDER=development` in production fails fast. Provider-specific settings — the fixed code, the hash secret — stay inside the OTP layer and never reach business logic or a lognable summary. Adding a real SMS provider means implementing `OtpProvider` and extending the selection function; no change to the OTP service, the activation flow, or the UI. This follows ADR-009's "provider boundary first, real provider only after requirements are confirmed" for the same reason.

## ADR-012: Preserve historical records through status and archive transitions

**Status:** Accepted

**Decision:** Close or archive schools, academic years, students, classrooms, notifications, and other historical entities rather than deleting records referenced by operational history.

**Rationale:** Reports, audits, and notification history require stable references.

**Decision:** Operational records use archive/status transitions instead of destructive deletion in the MVP. Detailed retention, export, privacy, and formal guardian-consent requirements remain deferred until before production launch.

## ADR-019: Use the Iranian mobile number as the login identity

**Status:** Accepted

**Decision:** The login identity is the user's Iranian mobile number, not an email address. Better Auth's phone-number plugin supplies password-based sign-in and the `phoneNumber` / `phoneNumberVerified` user fields. `src/lib/mobile.ts` is the single canonicalization point: all accepted spellings normalize to `09XXXXXXXXX` before storage and before lookup. A phone number must be verified to sign in.

**Rationale:** Schools know staff by mobile number, and mobile is the identifier SMS delivery already uses. One canonical format prevents the same person from existing twice because of how their number was typed.

**Consequences:** `email` remains required and unique because Better Auth identity rows and account provisioning still provide one; it is not a login credential on the product surface. Better Auth's own OTP endpoints remain disabled — its storage is plaintext, purpose-less, and has no cooldown — and self-service mobile verification for teachers is served instead by the OTP service in ADR-023, whose challenges are purpose-specific and keyed-hashed.

## ADR-020: Restrict the demo tenant bootstrap to development

**Status:** Accepted

**Decision:** The demo school and its School Admin account are created by a development-only operator tool, not by an application route, migration, or production code path. The environment gate runs before the first write and refuses production, any non-development `NODE_ENV`, and any non-local database. The seed is idempotent, never resets an existing password, and never overwrites a profile value an operator changed.

**Rationale:** A bootstrap that writes a known account with a known password is valuable in development and unacceptable in production. A hard precondition, checked before any write, is auditable in a way a documented convention is not.

**Consequences:** Demo credentials live only in development configuration and are never logged or exposed through an application route. Production tenant and account provisioning needs its own flow, which is deferred.

## ADR-029: Track the active school as a preference, not as authority

**Status:** Accepted

**Decision:** A user with memberships in several schools has one active school per request, resolved server-side. The selection is stored as an HttpOnly, SameSite=Lax cookie holding a school id, and it is read back only as a *preference* among the user's already-verified `ACTIVE` memberships. An explicit `schoolId` passed by a caller keeps the strict rule: no verified membership there is `SCHOOL_ACCESS_DENIED`. When no explicit id is passed, the resolver loads the user's active memberships in creation order, opens the one the preference names, and falls back to the first when the preference matches none.

**Rationale:** The alternative — treating a multi-school user as ambiguous and refusing them — makes a teacher who works at two schools unable to use the product at all, which is a legitimate and expected case for teachers (ADR-025 already anticipates one identity with a membership per authorizing school). But the selection cannot be authorization: a school id from the client is exactly the value ADR-001 forbids trusting. Splitting the two roles resolves it. Authorization is always "is there a verified, active membership for this user in this school", and the persisted value only picks among the schools that check already passed. That is why a forged or stale cookie is not a vulnerability: it can name a school the user cannot reach, and it is discarded rather than honored. Ordering the memberships gives determinism, so a user who has never switched always lands in the same school instead of whichever row a planner returned.

**Consequences:** `AMBIGUOUS_SCHOOL` is no longer reachable from the request path: the resolver always selects, either among a user's own memberships or within the single row an explicit `schoolId` can match (unique on `(schoolId, userId)`). The check remains in `selectActiveMembership` as a defensive invariant on a pure function, and the `AMBIGUOUS_SCHOOL` access state is removed. The school switcher is offered to a teacher with more than one school; School Admins never see it, and a single-school teacher does not either, though the server enforces the same rule regardless of what is rendered. Sign-out clears the cookie with the session, so a shared browser carries no school context forward. Persisted coverage lives in `src/features/account/account.integration.test.ts`, run through `corepack pnpm test:integration:account`, including a forged preference naming another user's school and a forged switch request from an unrelated user.

## ADR-030: Store the account's name pair instead of splitting the display name

**Status:** Accepted

**Decision:** `user` carries nullable `first_name` and `last_name` columns alongside the single `name` Better Auth requires. The account settings form loads its two fields from that pair, and `updateOwnProfile` writes the pair and `name` together. When the pair is unset — a legacy account, or one that has never saved its name — the form shows the whole `name` in the first-name field and an empty last name. No code splits a display name on whitespace.

**Rationale:** The form edits a first and a last name, but a global account stored only one `name`, so the fields had to be derived by splitting on the first space. That split is not reversible by any rejoining rule: "محمد رحیم رستمی" became "محمد" + "رحیم رستمی", and saving the untouched form wrote the reordered string back. A teacher never hit this because `teacher_profiles` already holds a real pair (ADR-022); the global account was the only place guessing. Storing the pair removes the guess at its source, and `name` remains for Better Auth, so the session and any existing reader are unaffected. The columns are nullable and rows are left null by the migration rather than filled by splitting `name`, because a migration-time split would permanently bake one interpretation of every existing multi-word name into the database — the same error, made once and irreversibly. Showing the whole name in one field is lossless: `joinDisplayName` of that pair is the original string, so an untouched save is a no-op and the user can split the fields themselves.

**Consequences:** A teacher's edits continue to write the school-local profile of the active school as well, so their account pair and that profile stay in step. Other schools that person belongs to are untouched, which is consistent with ADR-022. `splitDisplayName` is removed and replaced by `nameFieldsFor`, which never derives a split. Existing accounts appear with a combined first name until they save a corrected one; the account surface notes this rather than pre-splitting. Unit coverage is in `src/features/account/profile.test.ts`.
