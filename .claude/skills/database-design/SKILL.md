# Database design skill

Use this skill before changing the ZangYar database model or creating migrations.

1. Read `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`, and accepted entries in `docs/DECISIONS.md` first.
2. Treat `schools` as the tenant root and add explicit `schoolId` to every school-owned entity and join table.
3. Design same-tenant composite foreign keys, unique constraints, partial indexes, lifecycle states, and query indexes before writing schema code.
4. Preserve the approved rules: one role per membership, effective-dated non-overlapping classroom enrollments, school-unique normalized guardian mobile numbers, optional school-unique national ID, and archive/status history.
5. Use timezone-aware timestamps and school-local business dates; convert Persian-calendar input at the application boundary.
6. Check delete behavior, historical references, outbox idempotency, and cross-tenant negative cases.
7. Document model changes before generating migrations. Never run destructive database operations without explicit approval.
