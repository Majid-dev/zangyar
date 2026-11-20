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

## ADR-012: Preserve historical records through status and archive transitions

**Status:** Accepted

**Decision:** Close or archive schools, academic years, students, classrooms, notifications, and other historical entities rather than deleting records referenced by operational history.

**Rationale:** Reports, audits, and notification history require stable references.

**Decision:** Operational records use archive/status transitions instead of destructive deletion in the MVP. Detailed retention, export, privacy, and formal guardian-consent requirements remain deferred until before production launch.
