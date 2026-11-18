# Database migration testing

The repository includes migration validation scripts for the current Drizzle schema. They are development verification helpers, not a replacement for a production migration workflow.

## Clean migration

Run `corepack pnpm db:test-clean`.

The script creates an ephemeral PostgreSQL database, applies the committed Drizzle migrations, verifies the Better Auth, school, membership, academic-year, and classroom tables, then drops the temporary database. The configured `DATABASE_URL` is used only to connect to PostgreSQL and is not modified.

## Phase 4 persisted integration tests

Run `corepack pnpm test:integration:phase4`.

This command creates an isolated ephemeral database, applies migrations, runs the persisted school and academic-management tests, then drops the database. It verifies tenant-scoped school configuration, academic-year lifecycle, grade/subject/classroom creation, teacher assignment, audit events, and role rejection.

Do not run the Phase 4 integration test directly against a shared development database. Use the wrapper command so test records cannot affect local data.
