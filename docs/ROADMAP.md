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

**Status:** In progress

- Implement global user/session integration.
- Implement school membership and role checks.
- Implement active-school resolution from verified membership.
- Add server-side authorization helpers.
- Add negative cross-tenant access tests.
- Add audit events for membership and school access changes.
- Add membership queries and Server Actions with Zod validation.

**Completed in this phase slice:** Better Auth Drizzle adapter wiring; tenant-scoped membership listing, creation, and status changes; membership audit events; self-status-change protection; authorization unit tests.

**Remaining:** run the opt-in persisted Better Auth integration suite with `RUN_DB_INTEGRATION_TESTS=1`; add domain-specific resource-ownership cases as Phase 4 classroom resources are implemented; execute the migration test against a clean database.

**Exit criteria:** Protected operations reject unauthenticated users, invalid memberships, wrong roles, wrong tenants, and unauthorized resource access.

## Phase 4 — Schools and academic management

**Status:** In progress

- Implement school configuration and status.
- Implement academic years and transitions.
- Implement grades, subjects, and classrooms.
- Implement teacher memberships and classroom assignments.
- Add same-tenant composite constraints and indexes.
- Add school/academic management Zod schemas, queries, Server Actions, audit events, and authorization tests.

**Completed in this phase slice:** School configuration/status operations; academic-year creation and guarded transitions; grade and subject catalog operations; classroom creation; active teacher assignment; tenant-scoped queries; audit coverage for school, year, classroom, and assignment changes.

**Remaining:** add teacher-assignment management UI; add persisted tests for duplicate assignment rejection and archived catalog rejection.

Completed: UI routes/forms for school settings, academic years, catalog, and classrooms; lifecycle tests for status transitions, valid date ranges, assignment windows, and impossible dates.

Migration and persisted test commands: `corepack pnpm db:test-clean` and `corepack pnpm test:integration:phase4`.

**Exit criteria:** A School Admin can configure an academic year and assign teachers to classrooms without cross-tenant relationships.

## Phase 5 — Students, guardians, and enrollment

**Status:** Planned

- Implement school-local student records.
- Implement guardian contacts and student-guardian relationships.
- Implement enrollment into academic-year classrooms.
- Implement effective-dated classroom transfers with non-overlapping enrollment ranges.
- Add validation for active enrollment policy.
- Add effective-dated enrollment history and non-overlapping classroom transfer behavior.
- Add lifecycle and historical-record behavior.

**Exit criteria:** Students can be enrolled with multiple guardians and all relationships are tenant-safe and auditable.

## Phase 6 — Daily attendance

**Status:** Planned

- Implement school-local business-date handling.
- Create or load one daily session per classroom/date.
- Record the four attendance statuses.
- Enforce session and record uniqueness.
- Implement teacher assignment authorization.
- Add correction/finalization behavior after policy confirmation.
- Read the school's attendance notification policy when creating outbox entries.
- Add attendance reports and audit events.

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
- Create outbox records transactionally with eligible source events.
- Implement pending-item processing, retries, idempotency, and logs.
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
