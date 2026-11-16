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

**Status:** In progress

- Initialize the Next.js App Router project with strict TypeScript.
- Configure Tailwind, RTL layout, Vazirmatn, and ZangYar visual tokens.
- Configure Docker Compose PostgreSQL.
- Configure Drizzle and environment-variable conventions.
- Establish Better Auth integration boundary without implementing domain workflows.
- Add health check and baseline test/type/lint/build commands.

**Exit criteria:** Application starts, PostgreSQL starts, configuration is validated, and baseline checks pass.

## Phase 3 — Authentication, memberships, and tenant authorization

**Status:** Planned

- Implement global user/session integration.
- Implement school membership and role checks.
- Implement active-school resolution from verified membership.
- Add server-side authorization helpers.
- Add negative cross-tenant access tests.
- Add audit events for membership and school access changes.

**Exit criteria:** Protected operations reject unauthenticated users, invalid memberships, wrong roles, wrong tenants, and unauthorized resource access.

## Phase 4 — Schools and academic management

**Status:** Planned

- Implement school configuration and status.
- Implement academic years and transitions.
- Implement grades, subjects, and classrooms.
- Implement teacher memberships and classroom assignments.
- Add same-tenant composite constraints and indexes.

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
