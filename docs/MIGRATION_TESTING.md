# Database migration testing

The repository includes migration validation scripts for the current Drizzle schema. They are development verification helpers, not a replacement for a production migration workflow.

## Clean migration

Run `corepack pnpm db:test-clean`.

The script creates an ephemeral PostgreSQL database, applies the committed Drizzle migrations, verifies the Better Auth, school, membership, academic-year, and classroom tables, then drops the temporary database. The configured `DATABASE_URL` is used only to connect to PostgreSQL and is not modified.

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

This command creates an isolated ephemeral database, applies migrations, runs persisted attendance tests, then drops the temporary database. It verifies daily session and record persistence, school notification policy evaluation, eligible guardian filtering, recipient/policy snapshots, pending outbox intent, and same-status idempotency. SMS delivery, retries, and provider logs remain Phase 8 coverage.

## Teacher provisioning and invitation persisted integration tests

Run `corepack pnpm test:integration:teachers`.

This command creates an isolated ephemeral database, applies migrations, runs the persisted teacher suites, then drops the temporary database. It verifies teacher provisioning (profile, `TEACHER` membership, pending invitation, and no credential account), identity reuse across schools without touching the other tenant, refusal to repurpose an existing School Admin membership, restoration of a suspended membership instead of a duplicate, personnel-code uniqueness per school, and tenant isolation for both list and detail reads.

It also verifies the invitation lifecycle: the stored value is only the token hash and the plaintext never reaches the audit trail, one-time activation links a credential and enables sign-in, a reused or expired or revoked token is refused with a single generic message, a resend invalidates the previous token, deactivation withdraws a live invitation, an activated teacher cannot be re-invited, and the OTP endpoints stay closed.

One suite (`auth-transaction.integration.test.ts`) covers the transaction binding directly: a failure after identity creation must leave no user or account row behind, and a committed transaction must persist them. That case guards the invariant that provisioning cannot orphan an identity holding a mobile number.

Note: the wrapper passes its suite paths as positional filters to `vitest run`. Passing a bare `--` before them makes vitest ignore the filters and run every suite in the repository, which is why the wrappers pass paths directly.
