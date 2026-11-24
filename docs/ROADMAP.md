# ZangYar Roadmap

This roadmap separates product/design decisions from implementation work. Product and domain design is approved; Phase 2 establishes the application foundation before domain schema and business workflows are implemented.

## Phase 1 — Product and domain design

**Status:** Complete

- Review product scope and personas.
- Define school tenancy and membership model.
- Define academic-year, classroom, student, guardian, enrollment, attendance, activity, notification, and audit domains.
- Document ERD, ownership, cardinality, constraints, indexes, and lifecycle rules.
- Identify unresolved decisions and risks.
- Confirm role, enrollment-transfer, notification, guardian, calendar, and retention policies.
- Record confirmed decisions: one role per school membership, classroom transfers with effective-dated enrollments, admin-configurable attendance SMS triggers, and unique normalized guardian mobile numbers per school.

**Exit criteria:** Product and data-model documents approved; unresolved decisions that affect schema are resolved or explicitly deferred with an accepted design.

## Phase 2 — Foundation and project bootstrap

**Status:** Complete

- Initialize the Next.js App Router project with strict TypeScript.
- Configure Tailwind, RTL layout, Vazirmatn, and ZangYar visual tokens.
- Configure Docker Compose PostgreSQL.
- Configure Drizzle and environment-variable conventions.
- Establish Better Auth integration boundary without implementing domain workflows.
- Add health check and baseline test/type/lint/build commands.
- Add initial global identity/session schema and the Phase 3 server authorization boundary.

**Exit criteria:** Application starts, PostgreSQL starts, configuration is validated, and baseline checks pass. Verified on 2026-11-18: PostgreSQL healthy; `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm db:check`, and `corepack pnpm build` pass.

## Phase 3 — Authentication, memberships, and tenant authorization

**Status:** Complete

- Implement global user/session integration.
- Implement school membership and role checks.
- Implement active-school resolution from verified membership.
- Add server-side authorization helpers.
- Add negative cross-tenant access tests.
- Add audit events for membership and school access changes.
- Add membership queries and Server Actions with Zod validation.

**Completed in this phase slice:** Better Auth Drizzle adapter wiring; tenant-scoped membership listing, creation, and status changes; membership audit events; self-status-change protection; authorization unit tests.

### Authentication foundation and demo tenant

- Mobile-number login identity through Better Auth's phone-number plugin, with one canonical normalization path and password-based sign-in.
- Persian RTL login surface in the public `(auth)` route group, logout control in the authenticated shell, and unauthenticated redirect to `/login`.
- Idempotent development-only demo tenant seed wired as `db:seed:demo`, refusing production and non-local databases before any write.
- Persisted auth coverage: mobile login success and failure, seed idempotency and password preservation, tenant isolation, and role-escalation and platform-access denial, run through `test:integration:auth`.

### Teacher registration and approval

- School Admin authorizes a mobile number only: list searched by name, mobile, and personnel code, filtered by derived status, with the number correctable or deletable while unclaimed.
- Public registration at `/register`: number, OTP verification, then the teacher supplies their own name, optional personnel code, and password.
- Approval gate on membership status: a registered teacher is `PENDING_ADMIN_APPROVAL` and reaches no school resource until approved. Approval, rejection, deactivation, and reactivation are one guarded transition — approving a pending teacher *is* activating them — available from the teachers table as well as the teacher's page, with the actions derived from a single transition matrix.
- Deleting an unclaimed authorization removes the row outright and leaves nothing behind; a claimed one is retained and ends through deactivation.
- One global identity per mobile number, with a `TEACHER` membership and a school-local profile per authorizing school.
- Persisted coverage via `test:integration:teachers`, including transaction atomicity for identity creation, a proof that a registration cannot reference another school's membership, and a proof that deleting an authorization orphans nothing and stays on the audit trail.

### OTP verification infrastructure

- Provider-independent OTP service: `OtpProvider` interface, configuration-selected implementation, and a Development-only fixed-code provider.
- Purpose-specific challenges (`TEACHER_REGISTRATION`, `LOGIN`, `PASSWORD_RESET`) with keyed-hashed storage, expiry, attempt ceilings, resend cooldown, and per-number rate limiting.
- Production gate: the fixed-code provider is refused at startup, with no override; a missing provider fails closed at request time.
- Teacher registration requires a valid code before any identity is created; OTP login and password reset are wired end to end.
- Persisted coverage via `test:integration:otp`.

**Remaining:** a real SMS provider (the `sms` provider name is reserved and currently refused), expired-challenge cleanup, and Platform Admin operations. See the known authorization gaps in `docs/ARCHITECTURE.md`.

**Exit criteria:** Protected operations reject unauthenticated users, invalid memberships, wrong roles, wrong tenants, and unauthorized resource access.

## Phase 4 — Schools and academic management

**Status:** Complete

- Implement school configuration and status.
- Implement academic years and transitions.
- Implement grades, subjects, and classrooms.
- Implement teacher memberships and classroom assignments.
- Add same-tenant composite constraints and indexes.
- Add school/academic management Zod schemas, queries, Server Actions, audit events, and authorization tests.

**Completed:** School configuration/status operations; guarded academic-year lifecycle; active grade/subject catalog; classroom creation; active same-tenant teacher assignment; assignment date-window and duplicate protection; tenant-scoped queries; audit coverage; admin UI routes/forms; inactive/archived filtering; batched classroom-assignment loading; persisted integration coverage.

**Exit criteria verification (2026-11-18):** A School Admin can configure an academic year and assign teachers to classrooms without cross-tenant relationships. Verified by passing unit tests, typecheck, lint, Drizzle check, production build, clean migration test, and isolated persisted Phase 4 integration tests (40 tests passed).

Migration and persisted test commands: `corepack pnpm db:test-clean` and `corepack pnpm test:integration:phase4`.

**Exit criteria:** A School Admin can configure an academic year and assign teachers to classrooms without cross-tenant relationships.

## Phase 5 — Students, guardians, and enrollment

**Status:** Complete

- Implement school-local student records.
- Implement guardian contacts and student-guardian relationships.
- Implement enrollment into academic-year classrooms.
- Implement effective-dated classroom transfers with non-overlapping enrollment ranges.
- Add validation for active enrollment policy.
- Add effective-dated enrollment history and non-overlapping classroom transfer behavior.
- Add lifecycle and historical-record behavior.

**Exit criteria:** Students can be enrolled with multiple guardians and all relationships are tenant-safe and auditable. Verified by passing unit, authorization, and persisted integration tests (52 tests passed), and visual verification of tenant-scoped roster and student list.

## Phase 6 — Daily attendance

**Status:** In progress

**Completed slice:** Tenant/date-authorized classroom roster, daily session/record persistence, four-status upsert, same-day teacher restriction, correction audit events, Server Action wiring, data-backed attendance dashboard summary, and isolated Phase 6 integration wrapper/test.

- Implement school-local business-date handling.
- Create or load one daily session per classroom/date.
- Record the four attendance statuses.
- Enforce session and record uniqueness.
- Implement teacher assignment authorization.
- Add correction/finalization behavior after policy confirmation.
- Read the school's attendance notification policy and create eligible transactional outbox entries with recipient/message snapshots. (Completed in current Phase 6 slice.)
- Add attendance reports and expand audit-read coverage.

**Exit criteria:** Authorized staff can record and review daily attendance, while duplicate sessions, invalid enrollments, and cross-tenant access are rejected.

## Phase 7 — Classroom activities and reports

**Status:** Planned

- Implement activity categories and classroom activities.
- Record student-level activity outcomes.
- Add daily and monthly attendance reports.
- Add basic classroom and student summaries.
- Keep notification behavior independently configurable.

**Exit criteria:** Teachers can record activities for assigned classrooms and School Admins can access tenant-scoped reports.

## Phase 8 — Notification outbox and Mock SMS processing

**Status:** Planned

- Define the `SmsProvider` interface.
- Implement Mock SMS Provider.
- Consume pending attendance outbox records created by Phase 6.
- Implement claiming, retries, delivery idempotency, and provider attempt logs.
- Add notification status visibility and audit events.

**Exit criteria:** Attendance submission is independent of delivery, pending messages are retried safely, and duplicate sends are prevented.

## Phase 9 — Hardening and operational readiness

**Status:** Planned

- Expand tenant-isolation and authorization tests.
- Add end-to-end teacher attendance tests.
- Add database constraint and transaction tests.
- Review audit coverage and sensitive data access.
- Validate timezone and Persian-calendar behavior.
- Add production logging, error handling, and operational documentation.
- Select and evaluate a real Iranian SMS provider only after requirements are confirmed.

**Exit criteria:** MVP security, data-integrity, workflow, and operational checks are documented and passing.

## Deferred scope

- Parent portal and parent authentication
- Native mobile applications
- Online payments and subscription billing
- Advanced analytics and data warehouse
- AI-based student performance analysis
- Microservices, Kubernetes, Redis, and external queue infrastructure
- Real SMS provider integration before provider selection
