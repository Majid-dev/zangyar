# Database migration testing

The repository includes migration validation scripts for the current Drizzle schema. They are development verification helpers, not a replacement for a production migration workflow.

## Clean migration

Run `corepack pnpm db:test-clean`.

The script creates an ephemeral PostgreSQL database, applies the committed Drizzle migrations, verifies the Better Auth, school, membership, academic-year, and classroom tables, then drops the temporary database. The configured `DATABASE_URL` is used only to connect to PostgreSQL and is not modified.

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
