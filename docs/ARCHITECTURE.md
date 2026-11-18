# ZangYar Architecture

## Scope

ZangYar is designed as a modular monolith: one Next.js App Router application contains presentation, server-side application logic, domain modules, and database integration. The application uses a shared PostgreSQL database with shared tables and explicit tenant ownership.

This document describes the intended architecture for product and database implementation. No application features or migrations are included in the current design phase.

## Architectural boundaries

```text
src/
  app/           Routes, layouts, Server Actions, and Route Handlers
  components/    Shared UI and layout components
  features/      Domain modules and feature-specific schemas/services/queries/actions
  lib/           Server-only auth, database, tenant, validation, and utilities
docs/            Product, architecture, data-model, roadmap, and decision records
```

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

## Transaction boundaries

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

User-facing forms may accept Persian-calendar dates and convert them to Gregorian dates at the application boundary. Enrollment transfers use effective date ranges: close the previous enrollment and create the next one without overlapping ranges for the same student and academic year.

## Authentication and roles

Better Auth manages global identity and secure sessions. Application domain tables remain the source of truth for school membership and school business authorization.

Initial school-level roles are `SCHOOL_ADMIN` and `TEACHER`. Each school membership has exactly one role; a member cannot hold both roles through one membership. Platform Admin authorization is a separate explicit assignment and must never be inferred from a school role.

Parent authentication is outside MVP scope.

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

Remaining Phase 3 work: add domain-specific resource-ownership cases as Phase 4 classroom resources are implemented; execute the migration test against a clean database; add membership-management HTTP route boundaries if exposed beyond Server Actions.

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
