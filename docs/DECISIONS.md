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

**Status:** Superseded in part by ADR-031

**Decision:** Attendance is represented by `attendanceSessions` and `attendanceRecords`. The MVP creates one daily session per classroom and school-local date; `sessionKind` leaves room for future lesson-level sessions.

*Superseded:* ADR-031 arrived at the lesson-level model this anticipated: a session is now one timetable entry on one date, `sessionKind` is dropped, and the school's period timeline is what defines the sessions a day produces. The record-level reasoning below still holds.

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

**Consequences:** Reads that show a teacher join the profile. Deactivation and reactivation continue to act on the membership, so the profile row is retained rather than deleted, consistent with the archive-over-delete rule. The database cannot express "this membership has the TEACHER role" through a foreign key, so that requirement stays enforced in the service layer, the same known gap already recorded for a timetable entry's teacher, which the database cannot prove is a `TEACHER` either.

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

## ADR-031: Model the timetable as the source of teaching assignment, and attendance per period

**Status:** Accepted

**Decision:** A teacher's assignment to a class is the weekly timetable. The school's shift shape is two columns on its settings row (`shiftType`, plus `rotationBaseDate` when it rotates), its operating weekdays are `school_operating_days`, and its day is the single ordered list `school_periods`; `timetable_entries` joins a classroom to a weekday, period, subject, and the teacher or teacher pair responsible. The per-class `class_teachers` table is removed, and the one thing it held that is genuinely an attribute of the class — the homeroom teacher — becomes a single nullable column on `classrooms`. Attendance is recorded per period: `attendance_sessions` is unique on `(schoolId, timetableEntryId, businessDate)` and carries the subject, the responsible teacher, and the shift that actually ran, and `attendance_session_kind` is dropped. The hours an assignment consumes are stored on the assignment (`scope`, and the `hourCount` that follows), and mandatory weekly hours per teacher per academic year live in `teacher_weekly_hour_requirements`.

**Superseded in part (ADR-033):** the shift table and the per-shift period table described above were replaced by school-level settings, and the period's own `hourCount` moved onto the assignment.

**Superseded in part (ADR-034):** the assignment is now one teaching hour rather than one period, so the scope, the hours, and the second teacher are gone; and the class's homeroom teacher was dropped rather than kept as a column.

**Superseded in part (ADR-035):** the session is keyed on the period rather than on the timetable hour, so a split period is one register whose responsible teacher alternates weekly.

**Rationale:** `class_teachers` recorded that a teacher belonged to a classroom for a date range, which is not the question anyone actually asks. The school asks *when* a teacher teaches, whether the week adds up to their contract, and — where a single period is split between two teachers — whose hour a given week is. A date-ranged membership row can answer none of those: the first needs a weekday and a period, the second needs an hour worth, and the third needs a stated rule for alternating responsibility. It also described two different relationships in one row, because `subjectId` and `isPrimary` were independent ideas that happened to share a table, and its own partial unique index had already reduced the "primary" half to at most one row per classroom — the shape of a column, not of a relation.

Period-level attendance follows from the same fact. If a class meets six times a day, one daily session cannot say which lessons were registered; the daily model existed only because the MVP started there, and `sessionKind` was the placeholder for exactly this. Making the session belong to a timetable entry means "which periods are still unsubmitted" becomes a query rather than a computation, and the responsible teacher is recorded rather than re-derived.

Storing a period's hours rather than deriving them from its clock times is what makes the reporting rule expressible without special cases. "A two-hour period" and "two one-hour periods" are both just rows, a break is a row worth zero, and the assignment total is a sum. The clock times keep their own job — ordering the day and computing the submission deadline — and are not asked to double as an accounting unit.

**Consequences:** Teacher access to a roster, a timetable, and an attendance write is now decided by holding a slot in the classroom or being its homeroom teacher, declared once in `src/features/scheduling/policy.ts` and consulted by every path. All time-dependent resolution — the school week, the rotation index, which shift is in session, which of a shared slot's two teachers owes it, and the hours summary — lives in the pure `src/features/scheduling/week.ts`, which is unit-tested at the week and rotation boundaries. `attendance_sessions.submissionDeadlineAt` is computed once and stored so a deadline cannot move under a teacher when the timetable or the school's window is edited; a School Admin is exempt from it, because correction is their job (ADR-007), but not from the scheduling rules. Shifts and their entries are archived rather than deleted once they have run, consistent with ADR-012; a period, being configuration, is deletable until something references it. Migration `0010_phase6_scheduling` drops `class_teachers` and the session-kind enum and deletes attendance rows, which its NOT NULL columns could not otherwise accommodate — the task that owns the migration treats existing data as disposable, and that is the only reason it is safe.

## ADR-032: Make mandatory weekly hours the gate to scheduling, recorded at approval

**Status:** Accepted

**Decision:** A teacher's mandatory weekly hours are recorded in `teacher_weekly_hour_requirements` for the school's `ACTIVE` academic year, and a teacher whose figure is unset or zero cannot be given timetable slots. The figure is written as part of approval — the dialog collects it and `setTeacherStatus` writes both in one transaction — and corrected afterwards by `setTeacherWeeklyHours`, which is a separate service. The rule itself is the pure module `src/features/teachers/hours.ts`. An `ACTIVE` teacher with no usable figure is reported as `AWAITING_HOURS` rather than as `ACTIVE`.

**Rationale:** Approval previously granted access and left the teacher's workload unspecified, which the timetable then could not act on: giving a teacher slots without knowing how many they owe makes the assigned-hours report meaningless and lets a school overshoot or undershoot a contract by accident. Making the figure part of approval closes that gap at the moment the admin is already deciding about the teacher, rather than as a second task they might not realise they have.

Zero and missing are deliberately the same answer. A school that owes a teacher no hours has no reason to schedule them at all, so treating a recorded zero as "configured" would let a value that means nothing open the gate that exists to require a real number. The consequence to know is that a genuine zero is expressed by leaving the row absent.

The display status is derived rather than stored. `ACTIVE` with no figure is a real state — the teacher can sign in and cannot be scheduled — and reporting it as plainly active would overstate what they can do. Folding it into `membership_status` would add a fourth value to the one column every authorization check filters, and would make a statement about configuration look like a statement about access; deriving it instead needs no migration and cannot be reached for a pending, rejected, or deactivated teacher, because the flag only refines the active case.

The gate lives in the scheduling service, not the interface. `assertSchedulableTeacher` is what every timetable write passes through, so a hand-made request cannot schedule an unconfigured teacher and the UI only reflects the rule — the same arrangement ADR-010 describes for tenant scoping, applied to a configuration precondition.

**Consequences:** Approval requires an active academic year and fails with a sentence saying so when there is none, because the obligation belongs to a year and there is nowhere to record it otherwise. A reactivation does not ask for the figure again: it keeps what is on file, so re-entering it cannot silently change a number the admin did not come here to edit, and the dialog's hours field is driven by the action's `requiresWeeklyHours` flag — derived server-side like the rest of the action — rather than by the button that was pressed. Teachers approved before this rule exist in the `AWAITING_HOURS` state, which is what makes the backlog visible and gives the edit form something to clear; `src/features/teachers/hours.test.ts` and `status.test.ts` cover the boundaries, and `test:integration:teachers` covers approval-with-hours, refusal without them, the active-but-unconfigured state and its resolution, and the two status filters that now distinguish it.

## ADR-033: Put the shift on school settings, drop period kinds, and move hours onto the assignment

**Status:** Accepted (supersedes the shift and period parts of ADR-031; the assignment and split parts are superseded by ADR-034)

**Decision:** The school's shift is two columns on `school_settings` — `shiftType` (`MORNING`, `AFTERNOON`, `ROTATING`) and, when it rotates, `rotationBaseDate` — rather than rows in a `school_shifts` table. The school's day is the single ordered list `school_periods`, carrying only an `ordinal`, a `startTime`, and an `endTime`: no kind, no label, no hour count. Breaks are not modelled. `school_operating_days` loses `shift_id` and is keyed on `(schoolId, dayOfWeek)`. `timetable_entries` loses `shift_id` and gains `scope` (`FULL` or `SINGLE_HOUR`) with the `hourCount` derived from it, so a full assignment is a period's two hours and a split assignment is one hour to each of two teachers who alternate weeks. `attendance_sessions` gains `applicableShift`, recording the shift that actually ran.

**Rationale:** ADR-031 modelled a shift as a table because it assumed a school might run several, each with its own periods. That assumption stopped holding the moment a period acquired no kind and no label: with no way to say "this is a break" or "this is a morning period", a period is just a time range, and one time range list can only belong to one shift. A shift table would then have held exactly one row, or several rows sharing a single period list — a column dressed as a relation. Moving `shiftType` onto the settings row puts it next to the operating days, which it belongs with: which days a school is open is part of what kind of school it is, and saving them separately would let a date be briefly schedulable under a week that had already been replaced.

Dropping the period kind and the break rows is the same simplification seen from the other side. A break is not a thing the school schedules — it is the gap between two periods, already implied by their times, so a break row existed only to be skipped by everything that read the list. Removing it means the period list *is* the day, with nothing in it that has to be filtered out, and `ordinal` counts one kind of thing.

Moving the hours onto the assignment is what the two-hour period forces. A period is naturally two hours; sometimes one teacher takes both, and sometimes the school splits it into an hour each for two teachers who alternate. If the duration lived on the period, those would be two different periods with the same clock times, which is not a distinction the timetable can draw — the period is the same occasion either way. Putting the figure on the assignment lets one period be simultaneously "two hours of A's week" and "one hour of A's and one of B's", and makes the assigned-hours report a sum with no arithmetic on clock times. It also lets the database check the pairing: a `FULL` assignment is two hours, a `SINGLE_HOUR` one is one hour and necessarily has a partner and an anchor.

`applicableShift` on the session records what actually ran rather than re-deriving it. A rotating school's answer for a given date depends on the anchor, and an anchor is an editable setting; a register from last month must keep saying which shift it was submitted in even after the anchor moves.

**Consequences:** `db:migrate` on an existing database drops `school_shifts` and `school_shift_periods` after clearing their dependants, and migration `0011` deletes existing period, timetable, and attendance rows because the new columns are NOT NULL and carry meanings no existing row can supply — a period had no scope, a session had no shift, an entry's hours were the period's. The task that owns the migration treats current data as disposable. Two validations were added and are enforced in the service, not the UI: the school's operating week is checked before a period's own weekday so the refusal names the real cause, and reducing the operating days is refused while assignments or attendance depend on the removed days. A period cannot be edited onto times another period already occupies, because the submission deadline is measured from a period's end. The whole feature is configured from one page (`/academics/periods`, which replaces `/academics/shifts`), with the shift type as a radio group and the base date disabled unless the shift rotates, since the server refuses a base date on a fixed shift and a control that offers an impossible combination is a control that lies.

## ADR-034: Assign the timetable one teaching hour at a time, and drop the class's liable teacher

**Status:** Accepted (supersedes the assignment and split parts of ADR-031 and ADR-033; its attendance-granularity part is superseded by ADR-035)

**Decision:** A timetable assignment is one teaching hour rather than one period. `timetable_entries` gains `hour_index` (1 or 2, checked) and loses `scope`, `hour_count`, `partner_teacher_membership_id`, `rotation`, and `rotation_base_date`; `primary_teacher_membership_id` becomes `teacher_membership_id`, since there is no longer a secondary one. A period therefore holds two entries — its two hours — and each names its own subject and its own teacher. The unique guard moves from `(schoolId, classroomId, dayOfWeek, periodId)` to the same key plus `hourIndex`, so a class occupies each hour of a slot once. The service is `assignTimetableHours` (one teacher and one subject over a selected set of hours) and `clearTimetableHours` (archives the entries holding selected hours), replacing `upsertTimetableEntry` and `deleteTimetableEntry`. `classrooms.homeroom_teacher_membership_id` and its composite foreign key are dropped, and with them `setHomeroomTeacher` and the branch of `teacherClassroomAccessCondition` that consulted it. Assigned hours become a count of rows rather than a sum over a stored duration.

**Rationale:** ADR-033's model gave a period one row carrying a scope, a nullable partner teacher, and a rotation mode. That shape can express exactly one thing beyond a plain lesson — two teachers sharing *one* subject on alternating weeks — because the row has one `subjectId` and both teachers must name it. The product needs a period whose two hours are two different lessons with two different teachers, which that shape cannot hold at all: there is nowhere to put the second subject. The same limitation appears from the interface's side, where the requirement is "select the cells, then pick a teacher and a course": cells are hours, and a form that writes hours is what a grid of hours asks for.

Numbering the hour makes the scope, the partner column, and the rotation columns unnecessary rather than merely redundant. The scope and the hour count were derived from whether a partner was present; the partner was a second teacher kept in a column because there was only one row to keep them in; and the rotation described how that second teacher took their turn. Once a period has two rows, a second teacher is just the teacher of the other row, "how much of the period" is "which hour", and the three shapes the school uses — a full lesson, a single hour, a period split between two lessons — are all facts about which rows exist and what they name. Nothing stores the shape, so nothing can contradict it.

Dropping the hours count in favour of counting rows is what keeps the arithmetic honest. An assignment *is* an hour, so the assigned-hours report, the mandatory-hours comparison, and the clash check are counts with no clock arithmetic and no duration to disagree with the rows. Keeping a duration column would reintroduce the very question the hour-numbering answered — whether a period's two rows are one lesson or two — in the one place it cannot be answered.

The class's liable teacher goes because a column no interface can set is not a relationship to authorize on. The class-definition form no longer asks for one, and keeping it would have left teacher access to a roster resting on a value the product offers no way to write. Every teacher relationship a class has is now an hour inside it, which is one rule rather than two, and the access condition says so.

**Consequences:** Migration `0012` deletes existing timetable, attendance, outbox, and log rows before the reshape, because a single entry cannot be split into the two hour rows the new shape needs without inventing a second subject and teacher for a lesson that never had one; the task that owns it treats current data as disposable, which is the only reason it is safe. Teacher assignment is now checked against four conditions in one transaction: the teacher holds an active `TEACHER` membership here with a positive recorded figure, no selected hour is already theirs in another classroom, and the hours they would hold after the write do not exceed that figure. The last is a projection rather than a count — the cells being reassigned are deducted before the cells being given are added — so correcting a cell a teacher already owns is not refused as an overrun, which is the case a naive count would get wrong. The interface at `/academics/timetable` becomes a grid of days by periods with each period drawn as its two hours, and the assignment form moves below it: select cells, name a teacher and a lesson, save. A period whose two hours hold the same teacher and subject is drawn as one cell spanning both, and its label says "two hours", so a joined full period is distinguishable from a half-filled one at a glance. The form's teacher list is filtered to teachers with recorded hours and shows each one's remaining capacity, and conflicting cells are marked, but both are the interface reflecting a decision `assignTimetableHours` makes rather than making it. `resolveEntryTeacher` is deleted: responsibility is read from the row, so there is no rotation left to resolve for a date.

## ADR-035: One register per period, with weekly alternating responsibility for a split period

**Status:** Accepted (supersedes the attendance-granularity parts of ADR-031 and ADR-034)

**Decision:** Attendance is recorded per classroom period per business date. `attendance_sessions` loses `timetable_entry_id` and `subject_id` and gains `period_id`; the responsible teacher stays. Its uniqueness becomes `(schoolId, classroomId, periodId, businessDate)` and its reference follows to `school_periods`. `submitAttendance` takes a `classroomId`, a `periodId`, and a `businessDate`. When a period's two hours name two different teachers, the two alternate weekly and each owes the register for the whole period in their own weeks; the other is refused. The alternation is a pure function of the date — `resolveAttendanceRotationTeacher` in `src/features/scheduling/week.ts` — anchored on the academic year's `startDate` and counted in whole school weeks from the week that date opens.

**Rationale:** ADR-034 made attendance per teaching hour, which is right for a period one teacher holds and wrong for a split one. The product's rule for a split period is that one teacher owns the *whole* period for a given week and the two alternate — a fact about the period, not about either hour. Two per-hour registers cannot express it: there would be two sessions to hand between the teachers, two deadlines, and two places a register could disagree about whether the period had been taken. Keying the session on the period makes "who owes this" a single question with a single answer, and lets the two subjects of a split period stay where they belong, in the timetable, instead of forcing the session to name one of them.

Anchoring on the academic year's start date is what makes the alternation survive a year boundary. A rotation counted from a calendar week number resets in January, which would flip the parity mid-year and hand a period to the wrong teacher for the rest of the year; counting whole weeks from the year's own first day has no such reset, and needs no special case for leap years, month boundaries, or holidays, because none of them change how many weeks have elapsed since the anchor. The anchor is snapped to the school week it falls in, so a year that opens mid-week still changes over on a Saturday. The teacher holding the period's first hour takes the opening week.

Leaving the rotation out of storage is the same choice ADR-034 made about the shape of an assignment: the anchor is a date the school has already fixed, so a stored week-owner on each row would be a second source of truth for a fact already derivable from data on hand — and it would go stale the moment the year's start date were corrected. The interface asks the same pure function for any week it displays, past or future, so a teacher's history and a future forecast cannot disagree.

**Consequences:** Migration `0013` deletes existing attendance, outbox, and log rows: the new columns are NOT NULL and no per-hour row can say what a period-level register should. The task that owns it treats current data as disposable. The refusal order in `submitAttendance` is load-bearing and now explicit: the period must exist in this school, the school must be open on the date, and the date's weekday must be one the period is scheduled on — in that order, because "the school is closed" is the fact that explains the refusal where it applies, and a weekday filter applied during the read would collapse the first and third cases into one less useful "not found". Teaching hours are untouched: assigned hours are still counted from the timetable, so alternating responsibility changes who registers a period, never how much anyone teaches. `attendance_sessions` no longer names a subject, so a notification for a split period names both of its lessons together rather than picking one. The attendance workspace shows, for a rotating period, whose week it is and which week number of the year, so a teacher looking at a period they cannot submit sees why.

## ADR-036: Give a period both shifts' times, and default the rotation anchor and operating week

**Status:** Accepted (extends the period model of ADR-033 and ADR-035)

**Decision:** `school_periods` gains nullable `afternoon_start_time` and `afternoon_end_time` alongside the existing `start_time`/`end_time`. A fixed school keeps only the opening pair; a rotating school states the afternoon pair too, and which applies on a date is resolved from the shift that date falls in through `resolvePeriodTimes` rather than stored. The attendance submission deadline is measured from the period's end **in the active shift**, plus the configured grace period. Overlap between periods is checked per shift. In the interface, the operating days default to Saturday through Wednesday when the school has never saved a week, and the rotation anchor defaults to the active academic year's start date. The School Shifts and Periods page lays the settings panel out narrower than the periods panel, and the `/academics/shifts` link is corrected to `/academics/periods`.

**Rationale:** A rotating school alternates between two shifts week by week, and the two shifts do not have to begin and end at the same clock times — an afternoon session commonly starts later and runs later. With one pair of times on the period, the schedule could describe only one of them, and the deadline for an afternoon week was measured against a morning clock. Holding both pairs on the period is what makes the two shifts genuinely different schedules of the same day rather than the same schedule run twice. Keeping the opening pair in the original, non-null columns is what leaves a fixed school — and every existing row — unchanged and needs no backfill: the afternoon pair is null for them, and a rotating school that has not entered one falls back to the opening times rather than to a schedule nobody wrote, which is the same fallback the shift resolver itself uses. Resolving rather than storing the applicable pair keeps the anchor a single editable fact: correcting the year's start date or the rotation anchor moves every derived deadline with it, where a stored pair per date would go stale.

The deadline follows the active shift for the same reason it followed the period at all: a register a teacher is late for is late against the clock they were working to, and for a rotating week that is the afternoon's. Applying the grace period after that actual end time — not after the opening shift's — is what makes a late-afternoon submission neither wrongly accepted nor wrongly refused.

Overlap is per shift because the two shifts are separate schedules that may legitimately share clock times: a morning period and an afternoon period have no reason to avoid each other, and refusing a school's afternoon 13:00 because its morning also uses 13:00 would be refusing a conflict that does not exist.

**Consequences:** Migration `0014` is additive — two nullable columns and a check that the afternoon pair is all-or-nothing and ordered — so it deletes nothing and needs no data reset, unlike the migrations before it. `resolvePeriodTimes` is a pure function in `src/features/scheduling/week.ts`, unit-tested at the morning, afternoon, and no-afternoon-schedule boundaries, and consulted by the attendance deadline, the attendance slot list, and the timetable grid header so all three agree on what time a period runs. The deadline uses the shift-aware end time; the operating-week and weekday checks are unchanged. Two defaults are added without writing anything on the school's behalf: `DEFAULT_OPERATING_DAYS` is shown pre-checked only when the school has saved no week (the schema requires at least one day, so an empty set can only mean "never configured"), and the rotation anchor is prefilled from the active year's start date but remains the admin's to change and is stored only on their save. The `SchoolTimetableSettings` read reports `operatingDaysConfigured` separately from `operatingDays`, so a caller that needs to know whether the school is actually open is not satisfied by the default it is merely being shown. The settings and periods panels are given unequal widths — settings the narrower — because each period now carries two shifts' worth of times and an edit affordance while the settings hold a handful of choices; on a narrow screen they stack, settings first, so the day the periods are defined against is chosen before the periods themselves.

## ADR-037: Judge an occurrence's submission window with one pure resolver, and exempt the School Admin from it entirely

**Status:** Accepted (refines the correction policy of ADR-007 and the deadline of ADR-035 and ADR-036)

**Decision:** Whether a period's register may be written is decided by `resolveAttendanceWindow` in `src/features/attendance/window.ts`, a pure function taking the current instant, the period's start and end, the stored deadline, whether a session already exists and whether it is closed, and the asking role. It returns one of six states — `UPCOMING`, `OPEN`, `GRACE`, `EXPIRED`, `SUBMITTED`, `CLOSED` — plus `canSubmit` and a `blocker` sentence. Both the attendance page's badges and `submitAttendanceForContext`'s refusals call it, so the interface and the service cannot disagree about what is submittable. A teacher may write between the bell and the lapse of the grace period. A School Admin is exempt from the window entirely — the bell included — and only a closed session refuses them.

**Rationale:** The window was previously expressed twice: as a stored deadline the write path compared against, and as an ad-hoc `sessionId ? "ثبت شده" : "ثبت نشده"` badge on the page. Those two answer different questions, and neither could express the states a teacher actually experiences — a period that has not begun, one running now, one whose grace period is expiring, one gone cold. A single resolver that both sides call is what makes "the page offers it, so the server accepts it" a structural property rather than a coincidence of two conditions being written to match.

Exempting the School Admin from the *whole* window, rather than only the deadline, is what makes ADR-007's "any school date" literally true. The earlier reading held them to the bell, which quietly excluded the date an admin is preparing for — and a register for a period that has not happened yet is exactly what a school loads ahead of time. There is nothing to corrupt there: the freedom ADR-007 grants exists so a wrong status can be corrected, and a date with no register has no status to correct.

The state still reports the occurrence honestly whoever asks. An admin looking at tomorrow sees "در انتظار شروع" and one looking at last week sees "مهلت تمام شده"; `canSubmit` separately says whether *they* may act.

**Consequences:** The page derives its badges from the instants the query resolved, not from a pre-judged state word, so it re-judges as the clock moves without another read. The clock it compares is `useSyncExternalStore` over a shared 30-second ticker, whose server snapshot is the instant the server resolved the page — carried down as `serverNow` — so an occurrence sitting exactly on its bell or its deadline cannot render one state on the server and another on hydration. `getAttendanceWorkspaceForContext` now also returns the register's existing statuses, so a correction opens from what is on record instead of from a fresh row of "حاضر", and `getAttendanceSummaryForContext` reports `openPeriodCount` and `overduePeriodCount` — the periods a teacher could take now and the ones past their deadline unregistered — which the dashboard shows as a task rather than folding into a total. Two service defects are fixed by this work: the timetable rows a period's register is built from can span several weekdays, and were read ordered by hour alone, so the weekday check compared the submitted date against whichever day's row happened to come first — a period meeting twice a week refused its second day; the rows are now narrowed to the submitted weekday before the responsible teacher, subjects, and window are derived from them. Unit coverage is `src/features/attendance/window.test.ts`; the persisted suite covers a teacher before the bell, a teacher past the deadline, an admin correcting after it, and the two-weekday period.

## ADR-038: Let an already-Persian domain message reach the operator instead of collapsing to a generic failure

**Status:** Accepted (extends the error boundary of `src/lib/actions/messages.ts`)

**Decision:** `toUserMessage` maps English domain messages to Persian as before, and now also passes through a thrown message that is already written in Persian, treating it as known and safe to show. Untranslated English internals still collapse to the generic sentence.

**Rationale:** Two conventions had grown up side by side. Services about records that exist only inside the application — students, enrollments, teachers — raise English messages that this module translates, so the wording lives in one place. The scheduling and attendance services write the sentence directly, because a refusal like "the school does not operate on this day" is a statement about this school's configuration and routing it through an English key would be a longer path to the same words, with a second place for the two to disagree. The translator only knew the first convention, so every scheduling and attendance refusal — including the whole submission window — arrived at the operator as "انجام این عملیات ممکن نشد": a sentence that names nothing and suggests nothing, on the exact screens where the reason is actionable.

Recognising the script is what tells the two conventions apart without a registry of duplicated keys. A message written in Persian was written for a reader, so showing it is not a leak; an English internal that matches no key is still replaced by the generic sentence, so the set of things that can surface is widened by exactly the messages someone chose to phrase for an operator.

**Consequences:** A Persian refusal now reaches the teacher or admin verbatim, which is what makes "the grace period has expired" distinguishable from "this period is not yours this week". The guarantee that no unmapped internal detail leaks is unchanged, because the check is on the message's script rather than on its content, and `safeLogMessage` still records the original server-side for every failure. `src/lib/actions/execute.test.ts` continues to assert that an unmapped internal message collapses to the generic sentence.

## ADR-039: Split the dashboard by role at the query, and record administrator edits on the record itself

**Status:** Accepted (extends ADR-037 and the correction policy of ADR-007)

**Decision:** The dashboard is two shapes served from one route. `getDashboardDataForContext` resolves the reader's role and returns a union: a School Admin gets `overview` (active classrooms, students, teachers, and the day's occurrences counted as submitted / pending / missing) and attention items across the school; a teacher gets `teacherOverview` (their own classrooms, their students, and the periods the week handed them) and `teacherOverview` is null for an admin, `overview` null for a teacher — the absent shape is not fetched, not merely hidden. Both are built from `listAttendanceSlotsForContext`, which is already role-scoped.

Administrator edits to attendance are recorded on the record: `attendance_records` gains nullable `admin_edited_at` and `admin_edited_by_membership_id`, both null until a School Admin changes an already-recorded status, and never cleared afterwards. `recorded_by_membership_id` keeps its meaning — who took the register — and is no longer overwritten by a correction. Corrections made by an admin are audited as `ATTENDANCE_CORRECTED_BY_ADMIN` rather than `ATTENDANCE_CORRECTED`.

**Rationale:** The two roles open the same screen with different questions. An admin is asking whether the school's day is being recorded; a teacher is asking which of their own periods they owe. One read could not answer both without either showing a teacher school-wide figures they cannot act on — and should not be ranked against — or showing an admin a single classroom's worth of a school they are responsible for. Making the split at the query, and returning a union whose absent half is genuinely absent, is what makes "teachers never see school-wide data" a property of the payload rather than of a conditional in a component: there is no field for a teacher's response to carry.

Recording the admin edit on the record is what closes the gap the audit log left. `audit_logs` already said who changed a status to what, but nothing on the record said it had been touched, so a teacher opening a register they had submitted saw their own submission presented as untouched with the school's change invisible. A timestamp pair on the record answers the question where it is asked. Stamping only the *first* admin edit, and never clearing it, is what makes the tag mean "the office has been here" rather than "the last keystroke was the office's" — a correction followed by the teacher re-editing inside their window must not erase the fact that the school intervened. The timestamp and the administrator are a pair by check constraint, so a half answer cannot exist.

Leaving `recorded_by_membership_id` alone under correction is the same reasoning from the other side: an admin editing a teacher's submission must not destroy the evidence that the teacher submitted it, and "who took the register" and "who last touched it" are different facts that one column cannot carry at once.

**Consequences:** A teacher's dashboard payload has no `overview`, so a school-wide figure cannot be rendered from it by mistake; the authorization is that the figures were never read, which is tested by the role split in `getDashboardDataForContext` and the integration coverage of the tag. The attendance page's three filters — class, period, submission status — are URL parameters applied server-side; class and period narrow the query, while submission status is applied to the resolved slots because "missing" is a fact about a window, not a column. The filter applies to the *list* and never to the pickers, so choosing a status cannot make the class you were about to pick vanish. `window.ts`'s `resolveAttendanceWindow` is what the dashboard, the filters, the active-occurrence count, and the register all read, so none of them can disagree about an occurrence's state. Unit coverage is `src/features/attendance/window.test.ts`; the persisted suite covers the tag being raised on an admin edit, kept across later edits, the next-week teacher on a split period, and the filters' intersection.

## ADR-040: Address the open register separately from the filters, and scope the administrator's day by grade

**Status:** Accepted (extends ADR-039; amends the attendance filter contract)

**Decision:** Three pieces of state on the attendance page are now three separate query parameters rather than two overlapping ones.

- `gradeId` is the administrator's **scope**. It names exactly one grade and there is no "all grades" value; an absent `gradeId` means "the first grade with classes today", resolved by the query in the school's own grade order. The class picker offers only the chosen grade's classes.
- `classroomId`, `periodId`, `submissionStatus` are **filters**. They narrow within the scope and combine by intersection.
- `openSlotKey` (`classroomId:periodId`) is **which occurrence's register is open**. It is not a filter and is never written by a filter change.

A `view` parameter (`active` | `day`) selects between the periods in session at this instant and the whole day. `active` is the default. An opened occurrence is *added back* to the list when the reading would have hidden it, rather than suppressing the reading: the view toggle keeps saying what it says, and the card is on screen to be selected instead of open off-list. `isAttendancePeriodActive` — a new pure function beside `resolveAttendanceWindow` — answers "is this class in session right now" from the period's resolved instants.

**Rationale:** The card's link used to carry the filter pair, which meant clicking a tile silently rewrote the filters, and the list then came back describing only the card just clicked. Selection and filtering are different acts on different objects: one asks to look at a register, the other asks for a narrower list. They were conflated because the same two ids happen to name both, and a system where the same parameter means two things will keep re-deriving the wrong meaning.

Keeping `openSlotKey` separate is what makes "selected" survive a filtered list and a changed view, and what lets the empty state distinguish the three causes it can have. The card's own link writes only `openSlotKey`, built from the current query string, so neither opening a card nor leaving one changes a filter. Scoping the day by grade rather than offering "all grades" follows from the same reasoning from the other direction: a single-select whose unset value meant "everything" is a control with two meanings in one state, and it makes the class list ambiguous the moment two grades hold a class named "اول". A school's day is browsed a grade at a time, so the scope is stated rather than inferred.

`isAttendancePeriodActive` is separate from the window state because the state cannot answer "is a class in session": a register already taken reports `SUBMITTED` for the rest of the day, which is the right answer to what a teacher looking back wants, and the wrong answer to an administrator asking which class is happening now. It compares the instants the query resolved from the shift, the period schedule, and the week's rotation, so a rotating school's afternoon is read from the afternoon times and nothing is hardcoded.

**Consequences:** `listAttendanceSlotsForContext` takes an optional `gradeId` and joins `grades`, so every slot now carries its class's grade and grade order; the join is on an active grade, so a class in a retired grade cannot appear. `AttendanceSlot` gains `gradeId`, `gradeName`, and `gradeSortOrder`. `buildAttendanceFilterOptions` draws grades from the whole day — a picker offering only the grade you are already in is a dead end — and classes and periods from the chosen grade, before the other filters narrow, so a filter cannot hide the option you were about to switch to. The workspace also reports `daySlotCount` and `activeSlotCount` so the three empty states can be told apart, and `compareSlots` is exported and shared so the re-added occurrence lands in the day's order rather than in a second one. The filter count `totalSlotCount` is now the scoped count rather than the whole day's, since the grade is not something the clear action resets. `QuickActions` takes an `isAdmin` flag and omits "Add Student" for a teacher rather than hiding it, since a teacher's route is refused by `requirePageAccess(["SCHOOL_ADMIN"])` and the link only led to that refusal. Unit coverage of `isAttendancePeriodActive` is in `window.test.ts`; the persisted suite covers the default grade scope, the class list being restricted to it, a grade with no classes, opening a register without narrowing the list, the opened occurrence being restored under the active reading, and the active-period narrowing and widening.
