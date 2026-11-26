# Database migration testing

The repository includes migration validation scripts for the current Drizzle schema. They are development verification helpers, not a replacement for a production migration workflow.

## Clean migration

Run `corepack pnpm db:test-clean`.

The script creates an ephemeral PostgreSQL database, applies the committed Drizzle migrations, verifies the Better Auth, school, membership, academic-year, classroom, shift, period, operating-day, timetable, and teacher-hour tables, asserts that the superseded `class_teachers` table, the `attendance_session_kind` enum, and the per-assignment `period_assignment_scope` and `timetable_rotation` enums are gone, that the hour-slot timetable columns exist while `scope`, `hour_count`, the partner teacher, the rotation, and the classroom's homeroom teacher are gone, that the attendance session is keyed on the period rather than the timetable hour, and that a period carries both shifts' times (`afternoon_start_time`, `afternoon_end_time`) alongside the opening pair. It then drops the temporary database. The configured `DATABASE_URL` is used only to connect to PostgreSQL and is not modified.

## Authentication, demo seed, and tenant isolation

Run `corepack pnpm test:integration:auth`.

This command creates an isolated ephemeral database, applies migrations, and runs the persisted authentication suites: the mobile login boundary, demo tenant seed and its idempotency, and demo tenant isolation and role boundaries. It then drops the temporary database. Suites run without file parallelism because they share the demo tenant rows.

The persisted suites verify that a repeat seed creates no duplicate school, account, or membership and leaves the password hash and profile values unchanged; that the stored password is hashed; that mobile sign-in succeeds, an unknown mobile and a wrong password return the same status, and a non-Iranian number is rejected; that OTP delivery endpoints are unreachable; that a School Admin cannot grant platform access; and that revoked or suspended membership is denied.

## Phase 4 persisted integration tests

Run `corepack pnpm test:integration:phase4`.

This command creates an isolated ephemeral database, applies migrations, runs the persisted school and academic-management tests, then drops the database. It verifies tenant-scoped school configuration, academic-year lifecycle, grade/subject/classroom creation, teacher assignment, audit events, and role rejection.

Do not run persisted integration tests directly against a shared development database. Use isolated wrapper commands so test records cannot affect local data.

## Phase 5 persisted integration tests

Run `corepack pnpm test:integration:phase5`.

This command creates an isolated ephemeral database, applies migrations, runs the persisted student, guardian, cross-tenant, enrollment-transfer, and overlap tests, then drops the temporary database. It verifies school-local student and guardian records, relationship safety, and effective-dated enrollment history.

## Phase 6 persisted integration tests
Run `corepack pnpm test:integration:phase6`.

This command creates an isolated ephemeral database, applies migrations, runs persisted attendance tests, then drops the temporary database. It verifies per-period session and record persistence (a class registers each period once a date, and a split period is one register rather than two), school notification policy evaluation, eligible guardian filtering, recipient/policy snapshots naming the lesson, pending outbox intent, same-status idempotency, the school's submission window, refusal of a non-operating weekday, refusal of a date whose weekday the period is not scheduled on, refusal of a period from another school, that a split period alternates its responsible teacher week by week from the academic year's start date and refuses the other teacher in a week that is not theirs, and that alternating responsibility leaves each teacher's assigned hours unchanged. It also verifies that a rotating school's submission deadline is measured from the period's end time in the shift the date falls in — the afternoon schedule in an afternoon week, the morning schedule in a morning one. SMS delivery, retries, and provider logs remain Phase 8 coverage. SMS delivery, retries, and provider logs remain Phase 8 coverage.

## Timetable assignment persisted integration tests

Run `corepack pnpm test:integration:scheduling`.

This command creates an isolated ephemeral database, applies migrations, runs the persisted assignment suite, then drops the temporary database. It verifies that a period's two hours with the same teacher and subject read as one joined full lesson, that a period's two hours with different teachers and subjects read as two separate lessons, and that each counts one hour for the teacher it names. Refusals are covered as one operation: a teacher already teaching a selected hour in another classroom, a teacher with no recorded mandatory hours, a teacher from another school who holds hours there, an assignment that would exceed the teacher's mandatory hours, and an hour on a day the school does not operate. It also verifies that re-saving a teacher's own hour is not counted twice against their limit, that clearing hours frees the cells and stops counting them, and that raising a teacher's mandatory figure is what lets more be assigned.

## Teacher registration persisted integration tests

Run `corepack pnpm test:integration:teachers`.

This command creates an isolated ephemeral database, applies migrations, runs the persisted teacher suites, then drops the temporary database. It verifies that authorizing a number creates no account or membership, that a localized spelling is normalized before storage, that a duplicate live number in one school is refused while another school may authorize the same number, and that an unauthorized number is not sent a code.

It also verifies the registration itself: completing it creates a verified identity with a hashed password, a `TEACHER` membership in `PENDING_ADMIN_APPROVAL`, and a school-local profile carrying the supplied name and personnel code; a wrong code creates nothing; a valid code is not itself authorization; registering without a personnel code is allowed; and a number authorized by two schools yields one identity with a pending membership and profile at each. The status transitions are covered as one operation: approval grants access, rejection does not, a rejected teacher is re-admitted by the same approval transition, an illegal pair such as `ACTIVE → REJECTED` is refused, and every change records its decision on the audit trail. Deleting an unclaimed authorization removes the row and leaves no membership or profile behind while remaining on the audit trail and freeing the number to be re-authorized, whereas a claimed one cannot be deleted or have its number changed. Tenant isolation is covered for both list and detail reads, and a direct insert proves a registration cannot reference another school's membership.

One suite (`auth-transaction.integration.test.ts`) covers the transaction binding directly: a failure after identity creation must leave no user or account row behind, and a committed transaction must persist them. That case guards the invariant that registration cannot orphan an identity holding a mobile number.

Note: the wrapper passes its suite paths as positional filters to `vitest run`. Passing a bare `--` before them makes vitest ignore the filters and run every suite in the repository, which is why the wrappers pass paths directly.

## OTP verification persisted integration tests

Run `corepack pnpm test:integration:otp`.

This command creates an isolated ephemeral database, applies migrations, runs the persisted OTP suite, then drops the temporary database. It verifies that a code is stored only as a keyed hash, that the mobile is normalized before the challenge is keyed, that the correct code is accepted exactly once, that a wrong code and a missing challenge report the same message, that attempts exhaust the challenge at the ceiling, that an expired code is refused and revoked, that purposes are isolated, that a resend invalidates the previous code, and that the resend cooldown and per-number rate limit refuse with a retry hint.

It also covers tenant linkage (a challenge cannot reference another school's membership) and the HTTP boundary: no code in the response body, an identical response for a known and an unknown number on a non-revealing purpose, session minting through OTP login, a TEACHER_REGISTRATION code refused at the login endpoint, and Better Auth's own `/phone-number/send-otp` still returning 404.

The suite runs with `NODE_ENV=development` because it exercises the Development fixed-code provider, which a production value would correctly refuse. The production refusal itself is covered by unit tests in `src/lib/otp/environment.test.ts` with injected inputs.

Teacher registration requires a code, so `test:integration:teachers` requests one before completing each registration.
