# ZangYar

ZangYar (زنگ‌یار) is a Persian, RTL, multi-tenant school-management and parent-notification SaaS for schools in Iran.

The repository currently contains the Phase 2 foundation. Product and domain decisions are documented in `docs/`. Domain tables, migrations, school workflows, and tenant authorization are intentionally deferred until the foundation is reviewed.

## Requirements

- Node.js LTS
- Corepack-enabled pnpm 10
- Docker Desktop with Docker Compose

If `pnpm` is not directly available, use `corepack pnpm` in the commands below.

## Local setup

1. Install dependencies:

   ```bash
   corepack pnpm install
   ```

2. Copy `.env.example` to `.env.local` and replace the development auth secret with a random value of at least 32 characters.

3. Start PostgreSQL:

   ```bash
   docker compose up -d postgres
   docker compose ps
   ```

4. Start the development server:

   ```bash
   corepack pnpm dev
   ```

Open `http://localhost:3000`. The database health endpoint is available at `http://localhost:3000/api/health`.

## Commands

```bash
corepack pnpm dev
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test -- src/app/api/health/route.test.ts
corepack pnpm build
corepack pnpm db:check
```

`db:check` validates the Drizzle configuration. No domain schema or migrations are included yet.

## Foundation structure

- `src/app/` — App Router pages, layout, and HTTP route handlers
- `src/lib/db/` — server-only Drizzle connection boundary; domain schema is deferred
- `src/lib/auth/` — Better Auth configuration boundary; school memberships and authorization are deferred
- `docs/` — approved product, architecture, data-model, decision, and roadmap documentation
- `.claude/skills/` — product planning, database design, and tenant security review guidance

See `CLAUDE.md` for repository-specific instructions and `docs/ARCHITECTURE.md` for the intended modular-monolith and tenant-isolation strategy.
