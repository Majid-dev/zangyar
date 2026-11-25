# ZangYar Architecture

## Scope

ZangYar is designed as a modular monolith: one Next.js App Router application contains presentation, server-side application logic, domain modules, and database integration. The application uses a shared PostgreSQL database with shared tables and explicit tenant ownership.

This document describes the architecture implemented incrementally by the application. The repository currently includes the foundation, authentication/tenant authorization, academic management, student/enrollment workflows, and their committed migrations; later attendance, activity, and notification workflows remain in progress.

## Architectural boundaries

```text
src/
  app/           Routes, layouts, Server Actions, and Route Handlers
  components/    Shared UI and layout components
  features/      Domain modules and feature-specific schemas/services/queries/actions
  lib/           Server-only auth, database, tenant, validation, and utilities
docs/            Product, architecture, data-model, roadmap, and decision records
```

Login lives in the `(auth)` route group, which is public. Everything under `(app)` is authenticated and shares one layout: an unauthenticated visitor is redirected to `/login`, while an authenticated user without usable school context sees the matching access state.

### Presentation

`src/app` owns route composition, layouts, loading/error states, and HTTP boundaries. React components should not contain direct database access or authorization decisions that are relied on for security.

### Domain modules

`src/features` organizes business logic by domain, such as schools, students, classrooms, attendance, activities, and notifications. A feature should keep validation schemas, queries, services, actions, and feature components close together without introducing generic repositories prematurely.

### Infrastructure

`src/lib` contains server-only infrastructure: Better Auth integration, database connection and transaction helpers, active-school resolution, authorization utilities, input validation, date/time utilities, and provider abstractions.

## Tenant model

- `schools` is the tenant root.
- `users` are global accounts.
- `school_memberships` connects users to schools and determines school-level roles.
- Platform Admin is explicitly authorized outside school membership.
- Parents/guardians are school-owned contacts and are not authenticated users in the MVP.

Every school-owned table has a non-null `schoolId`. Every query and mutation involving school-owned data must receive a verified tenant context from the authenticated session and membership, not from a client-supplied tenant ID.

## Request authorization flow

A protected server operation follows this order:

1. Establish the authenticated user from the Better Auth session.
2. Resolve the active school from a verified membership. Reject missing or inactive membership context; when the user has several, select among them as described under **Active-school selection** below.
3. Check the membership role or required permission.
4. Load the target resource with the active `schoolId` in the query.
5. Verify resource-specific ownership, such as teacher assignment or classroom enrollment.
6. Perform the mutation in a transaction where multiple records must remain consistent.
7. Write an audit event for sensitive or significant actions.

The application must not use frontend role state, hidden navigation, or an unverified URL/query `schoolId` as authorization. Because a membership has exactly one role and `(schoolId, userId)` is unique, a user cannot hold both school-level roles in the same school in the MVP.

## Database tenant isolation

Tenant isolation is implemented in application queries and reinforced by relational constraints:

- All school-owned queries include `schoolId` predicates.
- All create operations derive `schoolId` from verified server context.
- Updates and deletes include both resource identity and tenant identity.
- Composite foreign keys include `schoolId` to prevent cross-tenant relationships.
- Join tables carry explicit `schoolId` even when it is derivable.
- Platform-wide queries are available only through explicit Platform Admin paths.

PostgreSQL Row Level Security may be considered later as defense in depth. It should not be enabled until transaction-scoped tenant context, pooled connections, migrations, and operational behavior are designed and tested together.

## Server boundaries

- Use Server Actions for internal application mutations where they provide a direct, typed application boundary.
- Use Route Handlers for health checks, external HTTP integrations, and future public/API endpoints.
- Validate every external input with Zod before domain logic runs.
- Keep database access in server-only modules.
- Keep SMS provider calls outside the attendance transaction.
- Server Actions return the typed `ActionResult` union (`ok`, error kind, safe message, and optional field errors) instead of exposing thrown database or implementation errors to the UI. Domain services remain presentation-neutral; translation and safe logging happen at the action boundary.

### Shared application shell

Authenticated routes use one shared `(app)` layout for the persistent sidebar, responsive mobile drawer, school context, and role-filtered navigation. Navigation visibility is presentation only; every destination retains its own server-side authorization. Back links use explicit parent routes rather than `router.back()`, so direct URL entry cannot create history loops or ambiguous navigation.

The layout also resolves the account control: the signed-in name, school-level role, and the schools the user may enter. It is assembled from the same verified membership context every other server read uses, so the menu cannot offer a school the request was not authorized for. Its panel is a popover on desktop and a bottom sheet on mobile; the sheet is portalled to the document body because the mobile header is a `backdrop-filter` element, which would otherwise become the containing block for its `position: fixed` layer.

### Active-school selection

A user with several memberships needs exactly one active school per request. The selection is resolved in `requireSchoolAccess`:

1. Load the user's verified, `ACTIVE` memberships, ordered by creation.
2. If the caller passed an explicit `schoolId`, hold it to the strict rule in `selectActiveMembership`: no verified membership there means `SCHOOL_ACCESS_DENIED`, never a fallback.
3. Otherwise read the persisted preference (`lib/auth/active-school`) and pass it to `selectPreferredMembership`, which selects among the already-verified rows and falls back to the first when the preference matches none.

The preference is therefore not authorization. It is an HttpOnly, SameSite=Lax cookie whose value is validated as a UUID before it is used, and it can only ever narrow which of the user's *own* memberships is opened: a stale value, or one hand-edited to name another tenant's school, matches no row and is discarded. Switching is a Server Action that authorizes the target school the strict way and then writes the cookie; the form is only rendered for a teacher with more than one school, but the server's check is what enforces it. Sign-out clears the cookie together with the session, so a shared browser carries no school context into the next session.

### Transaction boundaries

### Attendance

Attendance submission and its notification intent must be atomic:

1. Verify session, membership, classroom assignment, enrollment, and business date.
2. Create or load the unique attendance session.
3. Upsert or insert attendance records according to the correction policy.
4. Create eligible notification outbox records in the same database transaction.
5. Commit without waiting for an SMS provider.

A failed SMS call must not roll back a successful attendance transaction.

### Notifications

A separate processor claims pending outbox items, sends through an `SmsProvider`, and records attempts in `notificationLogs`. Temporary failures are retried using an idempotency key. Provider responses are persisted without exposing provider credentials to the UI. School Admins configure four attendance-status SMS triggers in the school settings UI; the effective policy decision is captured in each outbox item. Activity notifications are deferred.

## Date and time

- Store instants in PostgreSQL timezone-aware types (`timestamptz`).
- Store school-local business dates as PostgreSQL `date` values after resolving them in the school's timezone.
- Default school timezone is `Asia/Tehran`, but retain it as school configuration.
- Display dates using Persian-friendly formatting in the UI without changing stored instants.
- Do not derive attendance day boundaries from the server's local timezone.

User-facing forms may accept Persian-calendar dates and convert them to Gregorian dates at the application boundary. The reusable Jalali picker submits a hidden Gregorian ISO date while displaying Persian month names, digits, and weekday labels; date-only conversion uses UTC components to avoid timezone day shifts. Student, guardian, relationship, and enrollment mutations are owned by `src/features/students` and derive tenant identity from verified membership context. Teachers read students only through active, date-effective classroom assignments; teacher projections omit sensitive guardian contact data. Enrollment transfers use effective date ranges: close the previous enrollment and create the next one without overlapping ranges for the same student and academic year. PostgreSQL exclusion enforcement protects this invariant under concurrent writes.

Academic-year closure is one server-owned transaction: transition the year to `CLOSED`, archive only its active enrollments at the year end, retain terminal enrollments and student profile status, and write audit events. A compare-and-set status update prevents stale concurrent decisions; repeated `CLOSED → CLOSED` requests are legal idempotent no-ops. Operational classroom queries hide closed/archived-year rooms while historical rows remain queryable by explicit history paths. New classroom and enrollment services reject closed/archived years server-side.

## Authentication and roles

Better Auth manages global identity and secure sessions. Application domain tables remain the source of truth for school membership and school business authorization.

The login identity is the Iranian mobile number. The phone-number plugin supplies password-based sign-in and the `phoneNumber` / `phoneNumberVerified` user fields, and `src/lib/mobile.ts` is the single canonicalization point: every accepted spelling (`09…`, `+98…`, `0098…`, bare `9…`, Persian or Arabic digits) normalizes to `09XXXXXXXXX` before storage and before comparison, so input from one path always matches a lookup from another. A phone number must be verified to sign in. OTP delivery is not implemented because no SMS provider exists yet, so the OTP endpoints are disabled rather than left reachable in a non-functional state; verification state is set by an authorized provisioning path. Email/password remains enabled for existing accounts and tests, but the product login surface is mobile-only.

Initial school-level roles are `SCHOOL_ADMIN` and `TEACHER`. Each school membership has exactly one role; a member cannot hold both roles through one membership. Platform Admin authorization is a separate explicit assignment and must never be inferred from a school role. Membership creation accepts only the school-level roles, so a School Admin cannot grant or create platform-level access.

Parent authentication is outside MVP scope.

The demo tenant bootstrap (`src/features/auth/bootstrap/`) is a development operator tool, not an application route. Its environment gate runs before any write and refuses production and non-local databases; it is idempotent, preserves existing credentials and profiles, and creates no platform administrator. See `docs/DEVELOPMENT.md`.

### Teacher registration and approval

A School Admin registers only a mobile number (`src/features/teachers/`). That row in `teacher_registrations` is a durable authorization — "this number may join us" — and is deliberately separate from identity and membership, because a membership requires a `userId` and no account exists until the person registers. No name and no personnel code is asked for: those are the person's own details, so asking the admin for them would record something nobody has confirmed, and the personnel code is a teacher-school attribute that belongs on the profile (ADR-022). Nothing is sent: no invitation link, no SMS. The admin's registration of the number *is* the invitation.

The person then self-registers at the public `/register` page: they enter the number, prove it with an OTP, and supply a name, an optional personnel code, and a password. Eligibility is decided server-side from the authorization rows — the client supplies no school, so a registration cannot be steered at a tenant the person is not authorized for. If two schools authorized the same number, registration produces one global identity with a `PENDING_ADMIN_APPROVAL` membership and a `teacher_profile` at each. The whole completion is one transaction, so a failure cannot leave a half-registered identity. The personnel code is applied to each authorizing school's profile, so that school's partial unique index still governs whether it is free there; a clash surfaces as a conflict the person resolves by choosing another code. A School Admin can later correct the code on the teacher's page, since a typo should be recoverable without a database edit.

Approval is the gate. The states live on `membership_status` (`PENDING_ADMIN_APPROVAL`, `ACTIVE`, `REJECTED`, `SUSPENDED`), and because every authorization path already filters `status = 'ACTIVE'`, a pending or rejected teacher is denied everywhere without any check being edited. Approval, rejection, deactivation, and reactivation are one operation — `setTeacherStatus`, guarded by the transition matrix in `src/features/teachers/status.ts` — because only `ACTIVE` grants access, so approving a pending registration *is* activating the teacher and undoing a rejection is the same transition. Keeping them as separate services meant three copies of the same guard and three places for the rules to drift apart; the matrix is now the single home for "from here, these moves are legal," and both the detail page and the teachers table render the actions it derives rather than deciding for themselves. A registered but unapproved teacher can authenticate — they have a credential — but reaches no school resource and sees the `NO_SCHOOL` access state. Password recovery works for them and deliberately grants nothing: it changes a password, not an approval.

Registration writes identity rows inside the same transaction as the domain rows, using a Better Auth instance bound to that transaction (`authOptions(tx, { transaction: false })` in `src/lib/auth/auth-options.ts`). Without that binding the adapter would check out a separate pooled connection and a rollback would leave an orphan identity holding the mobile number. The registration OTP is verified *before* that transaction opens, so a rejected attempt's counter is not rolled back with it (see ADR-026).

Deactivation suspends the membership rather than deleting anything: access ends immediately while the teacher record and history are retained. A registration whose number was never claimed is deleted outright, because at that point the row is nothing but the admin's own assertion about a number nobody owns — no account, membership, or profile exists to orphan, and the audit event is written inside the same transaction so the record of the withdrawal survives the row. Once the number is claimed, the row becomes the durable record of who authorized it and is retained; ending that teacher's access is deactivation, not deletion.

### OTP verification

`src/lib/otp/` is a provider-independent layer for one-time codes. Business logic depends only on the `OtpProvider` interface — `issueCode()` plus `send()` — and the concrete provider is chosen by configuration in `selection.ts`, the single place that knows which providers exist. A real SMS provider is added later by implementing that interface and extending the selection function, with no change to the OTP service, the activation flow, or the UI. There is no separate `SmsProvider`: an SMS provider is an implementation of `OtpProvider`.

The MVP ships one provider: a Development-only fixed-code implementation that issues a configured constant and writes it to the server log. It is never rendered to a browser, and it cannot be selected in production — the gate in `src/lib/otp/environment.ts` runs from `authOptions()`, so an unsafe production configuration fails at startup rather than on first use. A missing provider is not a startup failure; it is refused when a code is actually requested, which is what lets a production build and boot succeed with no OTP configuration.

Challenges live in `otp_challenges`, keyed by purpose and normalized number, with only an HMAC-keyed hash of the code stored. This is deliberately separate from Better Auth's `verification` table, whose phone-number plugin stores codes in plaintext and has no purpose, attempt ceiling, cooldown, or membership link; those `/phone-number/*` routes stay disabled. Verification is single-use under a row lock, and a failed attempt commits its incremented counter on its own connection — a counter written inside a transaction that then aborts would be rolled back and would permit unlimited guessing.

`/otp/request`, `/otp/verify`, `/otp/login`, and `/otp/reset-password` are Better Auth plugin endpoints (`src/lib/auth/otp-plugin.ts`) rather than Server Actions, because login must set the session cookie and that needs an endpoint context. For login and password reset the request response is uniform whether or not an account exists, so it cannot enumerate members. Purposes are `TEACHER_REGISTRATION`, `LOGIN`, and `PASSWORD_RESET`.

Better Auth's own OTP paths stay closed and `sendOTP` stays a no-op; the plugin's `requireVerification` remains in force, so a phone still has to be verified to sign in with a password.

### Known authorization gaps

These are recorded, not yet closed, and are outside the current slice:

- `requirePlatformAdmin` has no callers yet; platform-level operations such as changing a school's status are currently gated as School Admin of that school.
- School status is enforced on write and admin paths (`requireOperationalAdmin`, `requireStudentManagementAccess`) but not on every read path.
- There is no last-admin protection: a School Admin can suspend or revoke every other admin of their school.
- A number authorized by several schools yields a pending membership at every one of them, and the person cannot decline an individual school. Accepting a subset would need a per-authorization decision the UI does not yet offer.
- `class_teachers.teacher_membership_id` enforces same-school membership at the database level, but the teacher-role requirement is enforced in the service layer only. The same applies to `teacher_profiles.membership_id`: a foreign key cannot express "this membership has the TEACHER role".
- `/sign-up/email` remains enabled because several existing integration suites depend on it. It creates a user with no membership, which `getSchoolContext` refuses as `NO_SCHOOL`, so it is not a tenant bypass — but it is an unauthenticated account-creation surface and should be reviewed before production.
- OTP login mints a session for any account with a verified mobile number, including one with no school membership. That holder then sees the `NO_SCHOOL` access state, which is consistent with how a memberless session is already treated — but it does mean a session can exist for a user with no school.
- A failed verification's attempt counter is committed on a separate connection from the caller's transaction. That is deliberate (see above), but it means the counter write is not atomic with the caller's own rollback.
- Account settings has no email field and no mobile change: the mobile number is the login identity, and correcting it is an authorized path (a teacher's unclaimed number by a School Admin, or a re-registration), not a self-service edit. Changing a *verified* number would need its own verification flow, which does not exist yet.
- A teacher's display name is stored twice — on the global account and on the school-local profile of the active school. `updateOwnProfile` writes both for the active school only, so a teacher in two schools can show a different name in each; the teacher list reads the school-local copy, and the shell reads whichever school is active. Reconciling them is not desirable (ADR-022 makes them per-school records), but the duplication is worth noting.
- `user.firstName` / `user.lastName` are nullable and only filled once an account saves its name through `/settings`. An account that never has shows its whole `name` in the first-name field, so the form is lossless but the two fields stay combined until the user splits them. A migration deliberately does not guess a split for existing rows.
- The `user` pair and `teacher_profiles` are still written together for a teacher, so a teacher's edits through `/settings` update their account pair as well as the active school's profile. Nothing propagates a name change to the other schools they belong to.
- `/settings` is reachable by any role, and its password form is offered whenever the account exists. An account with no password credential (none is currently creatable through the product flows) would get a mapped refusal rather than a form that explains itself up front.


## Audit architecture

Audit logs are append-only records with actor, action, target, school context, timestamp, and structured metadata. They should cover membership changes, attendance corrections, enrollment changes, notification configuration changes, and platform-level school operations. Sensitive metadata must be minimized and access to audit data must itself be authorized.

## Reporting architecture

Initial reports should use tenant-scoped database queries over attendance sessions and records. Do not introduce a warehouse, analytics service, or precomputed aggregation layer in the MVP. Add indexes based on actual report access patterns, especially school/classroom/date and school/student/date paths.

## Risks and safeguards

| Risk | Safeguard |
|---|---|
| Cross-tenant resource access | Verified membership context, tenant predicates, composite foreign keys, negative tests. |
| Attendance and SMS inconsistency | Transactional outbox. |
| Duplicate SMS delivery | Idempotency key and provider attempt logs. |
| Historical data loss | Restrictive deletes and archive/close states. |
| Incorrect day boundary | School timezone and explicit business-date storage. |
| Overloaded domain modules | Feature-oriented organization and direct, concrete services. |
| Unsafe platform queries | Separate Platform Admin authorization path. |

## Phase 3 implementation status

The initial Phase 3 authorization boundary is now in place in `src/lib/auth/authorization.ts` and `src/lib/auth/authorization-core.ts`:

- Authentication is resolved from the Better Auth session before membership lookup.
- Active school membership is loaded server-side and filtered by active status.
- A requested `schoolId` is only a selector against verified memberships, never authorization evidence.
- Ambiguous membership context, missing membership, unauthenticated access, wrong role, and missing Platform Admin access are rejected.
- Membership mutations use Zod validation, tenant-scoped updates, transactions, and audit events in `src/features/memberships/services.ts`.
- Pure active-school selection tests cover missing, matching, and cross-tenant selectors, and the preference fallback.
- Login identity is the normalized Iranian mobile number, and the public `(auth)/login` route is the only product credential surface.
- Persisted coverage runs through `corepack pnpm test:integration:auth` in an ephemeral migrated database: mobile login success and failure, OTP endpoint closure, demo seed idempotency and password preservation, and tenant/role isolation.

Remaining Phase 3 work: continue domain-specific resource-ownership cases as later domain resources are implemented; add membership-management HTTP route boundaries if exposed beyond Server Actions; close the known authorization gaps listed above.

### Account settings slice

Every signed-in user has an account control in the shell and a `/settings` page. The control shows the name, the school-level role, and the active school, and offers the school switcher (teachers with more than one school only, per ADR-029), Settings, and sign-out. The page edits the two things a user owns — their display name and their password — and states what it deliberately does not: the mobile number is the login identity and is changed by an authorized school path, and role, membership, and access status are not user-editable inputs at all.

The name is written to the account's own `firstName` / `lastName` pair and its `name`, and — for a teacher — to the `teacher_profiles` row of the *active* school only, because a teacher's profile is school-local (ADR-022) and a name change in one school is not that school's to make in another. Storing the pair is what keeps the form idempotent: it is loaded from those two fields rather than re-derived from `name`, so saving an untouched form cannot reorder a multi-word name (see ADR-030). The password change delegates to Better Auth's `/change-password`, which verifies the current password against the stored hash; `revokeOtherSessions` is left off because the endpoint mints a replacement session and needs to write its cookie, which a Server Action cannot do for the caller, so revoking there would sign the user out of the request that made it. Sign-out revokes the session through Better Auth and clears the school preference, and waits for both before navigating, so the login page is never reached while a session is still valid.

Persisted coverage runs through `corepack pnpm test:integration:account`.

### Teacher registration slice

Teacher registration replaces the earlier invitation flow and is complete: School Admin management of authorized mobile numbers (list searched by name, mobile, and personnel code, filtered by derived status, add, correct or delete while unclaimed), the public `/register` flow (mobile, OTP, name, optional personnel code, and password), and one status decision — approve, reject, deactivate, or reactivate — driven by a single transition matrix and available from both the teachers table and the teacher's page. Persisted coverage runs through `corepack pnpm test:integration:teachers` in an ephemeral migrated database, including a transaction-atomicity case proving a rolled-back registration leaves no orphan identity, a case proving a registration cannot reference another school's membership, a case proving a deleted authorization leaves no membership or profile behind and remains on the audit trail, and cases proving the teacher-supplied personnel code lands on their profile and that registering without one is allowed.

Known limits in this slice: no SMS or email provider exists, so the registration code is the Development fixed code written to the server log; a number authorized by several schools yields a pending membership at each, and the person cannot decline one; and the teacher-role requirement on a profile's membership is enforced in the service layer only.

### OTP verification slice

OTP verification is complete: a provider-independent service whose delivery provider is selected by configuration, a Development-only fixed-code provider, purpose-specific challenges (`TEACHER_REGISTRATION`, `LOGIN`, `PASSWORD_RESET`) with keyed-hashed storage, expiry, attempt ceilings, resend cooldown, and per-number rate limiting, plus a production gate that refuses the fixed-code provider at startup. Teacher registration requires a valid code before any identity is created, and OTP login and password reset are wired end to end.

The `/otp/*` endpoints serve only account-bound purposes; `TEACHER_REGISTRATION` is issued by the teacher feature, whose eligibility rule is "a School Admin authorized this number" rather than "an account exists", and the endpoint refuses that purpose explicitly.

Persisted coverage runs through `corepack pnpm test:integration:otp` in an ephemeral migrated database, covering issuance, keyed-hashed storage, one-time use, expiry, attempt exhaustion, purpose isolation, resend cooldown, rate limiting, tenant-scoped linkage, anti-enumeration, and session minting. Unit tests cover the pure policy and the production gate with injected inputs.

Known limits: no real SMS provider yet (the `sms` name is reserved and refused rather than faked); expired challenges are retained rather than swept, with an index in place for a future cleanup job; and email/password reset through Better Auth's own routes remains disabled in favour of the OTP flow.

## Phase 4 implementation status

Phase 4 school and academic management is complete. School Admin operations are authenticated, tenant-scoped, operational-school restricted, and audited. Academic years use guarded lifecycle transitions; closing a year atomically archives its active enrollments, preserves student profiles and history, hides its classrooms from operational lists, and rejects new classrooms/enrollments. Grades, subjects, and classrooms enforce same-school relationships and reject archived catalog records. Teacher assignments require active same-tenant teacher memberships, valid academic-year date windows, active subjects, and duplicate protection. Academic management pages expose school settings, academic years, catalogs, classrooms, and teacher assignment forms. Classroom assignment reads filter inactive records and batch tenant-scoped data loading.

Verification: unit/integration tests, `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm db:check`, `corepack pnpm build`, `corepack pnpm db:test-clean`, and `corepack pnpm test:integration:phase4` pass. The current persisted Phase 4 suite passes 40 tests in an ephemeral database.

## Phase 5 and Phase 6 implementation status

Phase 5 student, guardian, and enrollment workflows are implemented with tenant-scoped services, normalized identifiers, effective-dated enrollment transfers, PostgreSQL overlap protection, lifecycle audits, and persisted integration coverage. Guardian contact and relationship flags are edited through one profile form action. Non-active student profiles can be explicitly reactivated without reopening enrollment history. The student list, create route, and tenant-scoped student detail route are available.

Phase 6 attendance now has a tenant/date-authorized persisted vertical slice: daily session uniqueness, effective-roster validation, status upsert, same-day teacher restriction, correction audits, server action, and transactional notification intent. Attendance reads school-local status policy, creates one pending outbox intent per eligible active SMS guardian, and snapshots recipient mobile, message, and policy decision. Same-status resubmission is idempotent by school, attendance record, guardian, and resulting status. SMS provider delivery, claiming, retries, logs, and delivery visibility remain Phase 8 work.

## Implementation sequence

1. Finalize remaining enrollment, notification, and date decisions; role cardinality and mobile uniqueness are decided.
2. Finalize the explicit data model and constraints.
3. Implement authentication integration and tenant-context utilities.
4. Add school and academic management.
5. Add students, guardians, and enrollment.
6. Add attendance and audit events.
7. Add activity records and reports.
8. Add notification outbox and Mock SMS processing.
9. Add cross-tenant, authorization, integration, and end-to-end tests.
