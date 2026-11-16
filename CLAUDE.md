# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Project

ZangYar (زنگ‌یار) is a Persian, RTL, multi-tenant school-management and parent-notification SaaS for schools in Iran. Build it as a modular monolith: one Next.js application containing the UI and server-side domain logic. The initial task is foundation/bootstrap work; do not implement school-management workflows until the foundation is reviewed.

## Technology

The committed stack is:

- Next.js App Router with React and strict TypeScript
- pnpm and Node.js LTS
- Tailwind CSS, shadcn/ui, Lucide, and Vazirmatn
- PostgreSQL with Drizzle ORM and Drizzle Kit
- Better Auth for email/password authentication and sessions
- Vitest and Playwright
- Docker Compose for local PostgreSQL

Use Persian as the primary interface language and preserve RTL layout and Asia/Tehran school-local date behavior.

## Architecture

Keep presentation, domain logic, and infrastructure separate:

- `src/app/` contains routes, layouts, Server Actions, and Route Handlers.
- `src/components/` contains shared UI and layout components.
- `src/features/` contains domain modules; keep schemas, queries, services, actions, and feature components close to the feature that owns them.
- `src/lib/` contains server-only infrastructure such as authentication, database access, tenant resolution, validation, and shared utilities.
- `docs/` contains the product, architecture, data-model, roadmap, and decision documentation.

Database access must stay outside React components. Validate external input with Zod. Use Server Actions for internal application mutations and Route Handlers for HTTP endpoints or future external integrations. Keep notification delivery independent of attendance logic and use the planned transactional outbox boundary.

## Tenant security

A school is the tenant. Users are global accounts; `SchoolMembership` records connect users to schools and define school-level roles. Platform Admin access is separate from school membership.

Resolve the active school from the authenticated user's verified membership; never treat a client-supplied `schoolId` as authorization. Every school-owned read and write must be tenant-scoped and server-authorized, including resource ownership checks and cross-tenant relationship constraints. Platform-wide queries require explicit Platform Admin authorization. Add cross-tenant access tests as domain features are implemented.

## Development commands

The repository currently contains no application files or package scripts. Once the foundation is bootstrapped, confirm the exact scripts in `package.json` and keep this section synchronized. The intended commands are:

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test -- <test-file-or-pattern>
pnpm test:e2e
pnpm build

docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
```

Do not document a command as verified until it exists in the project configuration and has been run successfully. Report unavailable or failing checks plainly.

## Documentation expectations

Update the relevant files in `docs/` when architecture, tenant isolation, data-model, product scope, roadmap, or significant technical decisions change. Keep the root guidance concise and put detailed workflows in project-specific Claude skills. During bootstrap, create the requested documentation and skills; stop before implementing MVP entities or workflows.
