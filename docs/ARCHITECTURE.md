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
2. Resolve the active school from a verified membership. Reject missing, inactive, or ambiguous membership context.
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

### Teacher provisioning and activation

A School Admin adds a teacher by name and mobile number (`src/features/teachers/`). Teachers never self-register into a school, and no provisioning input accepts a role: the created membership is always `TEACHER`.

Provisioning creates or reuses the global user identity by normalized mobile number, creates the `TEACHER` membership in the acting admin's verified school, writes the teacher profile, and issues a one-time activation invitation. It does **not** set a password. The account is created with a verified mobile number and no credential account, and both enabled sign-in endpoints reject an account with no credential — so a provisioned teacher provably cannot authenticate until activation completes. That invariant is covered by test, not merely documented.

Invitation state is stored separately from membership state: `teacher_invitations.status` is `PENDING`, `REVOKED`, or `CONSUMED`, with `EXPIRED` derived from `expiresAt` so no sweeper job is needed. Membership status continues to mean school access alone. The token is stored only as a SHA-256 hash, is single-use through a conditional consume-and-link in one transaction, and never appears in the audit trail. Resending revokes every previous pending invitation, and a partial unique index permits at most one usable invitation per membership. Because no SMS or email provider exists yet, the activation link is shown to the admin to pass along; `POST /activate/[token]` is the only public, token-authorized surface, and it derives the school, account, and role from the invitation row rather than from any client value.

Teacher provisioning writes identity rows inside the same transaction as the domain rows, using a Better Auth instance bound to that transaction (`authOptions(tx, { transaction: false })` in `src/lib/auth/auth-options.ts`). Without that binding the adapter would check out a separate pooled connection and a rollback would leave an orphan identity holding the mobile number.

Deactivation suspends the membership rather than deleting anything: every authorization check reads an active membership, so access ends immediately while the teacher record and history are retained. A suspended teacher keeps their credential and can still authenticate, but holds no active membership, so school authorization denies them — the intended end state.

### OTP verification

`src/lib/otp/` is a provider-independent layer for one-time codes. Business logic depends only on the `OtpProvider` interface — `issueCode()` plus `send()` — and the concrete provider is chosen by configuration in `selection.ts`, the single place that knows which providers exist. A real SMS provider is added later by implementing that interface and extending the selection function, with no change to the OTP service, the activation flow, or the UI. There is no separate `SmsProvider`: an SMS provider is an implementation of `OtpProvider`.

The MVP ships one provider: a Development-only fixed-code implementation that issues a configured constant and writes it to the server log. It is never rendered to a browser, and it cannot be selected in production — the gate in `src/lib/otp/environment.ts` runs from `authOptions()`, so an unsafe production configuration fails at startup rather than on first use. A missing provider is not a startup failure; it is refused when a code is actually requested, which is what lets a production build and boot succeed with no OTP configuration.

Challenges live in `otp_challenges`, keyed by purpose and normalized number, with only an HMAC-keyed hash of the code stored. This is deliberately separate from Better Auth's `verification` table, whose phone-number plugin stores codes in plaintext and has no purpose, attempt ceiling, cooldown, or membership link; those `/phone-number/*` routes stay disabled. Verification is single-use under a row lock, and a failed attempt commits its incremented counter on its own connection — a counter written inside a transaction that then aborts would be rolled back and would permit unlimited guessing.

`/otp/request`, `/otp/verify`, `/otp/login`, and `/otp/reset-password` are Better Auth plugin endpoints (`src/lib/auth/otp-plugin.ts`) rather than Server Actions, because login must set the session cookie and that needs an endpoint context. For login and password reset the request response is uniform whether or not an account exists, so it cannot enumerate members. Purposes are `TEACHER_ACTIVATION`, `LOGIN`, and `PASSWORD_RESET`.

Better Auth's own OTP paths stay closed and `sendOTP` stays a no-op; the plugin's `requireVerification` remains in force, so a phone still has to be verified to sign in with a password.

### Known authorization gaps

These are recorded, not yet closed, and are outside the current slice:

- `requirePlatformAdmin` has no callers yet; platform-level operations such as changing a school's status are currently gated as School Admin of that school.
- School status is enforced on write and admin paths (`requireOperationalAdmin`, `requireStudentManagementAccess`) but not on every read path.
- There is no last-admin protection: a School Admin can suspend or revoke every other admin of their school.
- Re-inviting a previously revoked member has no dedicated path and currently surfaces as a uniqueness conflict. (Teacher provisioning now restores a suspended or revoked membership instead, and issues a fresh invitation; the gap remains for non-teacher memberships.)
- `class_teachers.teacher_membership_id` enforces same-school membership at the database level, but the teacher-role requirement is enforced in the service layer only. The same applies to `teacher_profiles.membership_id`: a foreign key cannot express "this membership has the TEACHER role".
- `/sign-up/email` remains enabled because several existing integration suites depend on it. It creates a user with no membership, which `getSchoolContext` refuses as `NO_SCHOOL`, so it is not a tenant bypass — but it is an unauthenticated account-creation surface and should be reviewed before production.
- OTP login mints a session for any account with a verified mobile number, including one with no school membership. That holder then sees the `NO_SCHOOL` access state, which is consistent with how a memberless session is already treated — but it does mean a session can exist for a user with no school.
- A failed verification's attempt counter is committed on a separate connection from the caller's transaction. That is deliberate (see above), but it means the counter write is not atomic with the caller's own rollback.


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
- Pure active-school selection tests cover missing, ambiguous, matching, and cross-tenant selectors.
- Login identity is the normalized Iranian mobile number, and the public `(auth)/login` route is the only product credential surface.
- Persisted coverage runs through `corepack pnpm test:integration:auth` in an ephemeral migrated database: mobile login success and failure, OTP endpoint closure, demo seed idempotency and password preservation, and tenant/role isolation.

Remaining Phase 3 work: continue domain-specific resource-ownership cases as later domain resources are implemented; add membership-management HTTP route boundaries if exposed beyond Server Actions; close the known authorization gaps listed above.

### Teacher provisioning slice

Teacher invitation and account provisioning is complete: School Admin teacher management (list with name and mobile search and filters by membership status and invitation status, add, edit, view), the invitation lifecycle (issue, resend invalidating previous tokens, revoke, expiry), activation through a public one-time link, and deactivation and reactivation via membership status. Persisted coverage runs through `corepack pnpm test:integration:teachers` in an ephemeral migrated database and includes a transaction-atomicity case proving a rolled-back provisioning leaves no orphan identity.

Known limits in this slice: the activation link is delivered by the admin because no SMS or email provider exists; there is no last-admin protection; and the teacher-role requirement on a profile's membership is enforced in the service layer only.

### OTP verification slice

OTP verification is complete: a provider-independent service whose delivery provider is selected by configuration, a Development-only fixed-code provider, purpose-specific challenges (`TEACHER_ACTIVATION`, `LOGIN`, `PASSWORD_RESET`) with keyed-hashed storage, expiry, attempt ceilings, resend cooldown, and per-number rate limiting, plus a production gate that refuses the fixed-code provider at startup. Teacher activation now requires a valid code before a credential is linked, and OTP login and password reset are wired end to end.

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
