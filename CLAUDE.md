# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Project

ZangYar (زنگ‌یار) is a Persian, RTL, multi-tenant school-management and parent-notification SaaS for schools in Iran. Build it as a modular monolith: one Next.js application containing the UI and server-side domain logic. Product and domain design are approved in `docs/`; the foundation, academic management, and student/enrollment slices are implemented incrementally.

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

Current verification and integration scripts are defined in `package.json`. Use Corepack when pnpm is not directly available on PATH:

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test -- <test-file-or-pattern>
corepack pnpm build
corepack pnpm db:check

docker compose up -d postgres
docker compose ps
```

The project has committed domain migrations and persisted Phase 4/5 integration wrappers; no end-to-end test suite is configured yet. Do not document `test:e2e` as available. Do not document a command as verified until it exists in project configuration and has been run successfully. Report unavailable or failing checks plainly.

# Repository Exploration Rules

- Never scan the entire repository unless explicitly requested.
- Never read package-lock.json, yarn.lock, generated files,
  binaries, build outputs, or dependency directories.
- Start with targeted search.
- Read only relevant sections of files.
- Avoid recursively listing large directories.
- Do not repeat file reads unless the file changed.

## Documentation expectations

Update relevant files in `docs/` when architecture, tenant isolation, data-model, product scope, roadmap, or significant technical decisions change. Keep root guidance concise and put detailed workflows in project-specific Claude skills. Implement each approved domain slice behind tenant-scoped services, migrations, and tests; do not bypass the authorization boundary.

# ZangYar — UI/UX & Visual Design Principles

## Design Philosophy

Design ZangYar as a distinctive, premium, human-centered school platform.

The interface must feel intentionally designed, not AI-generated, template-driven, or like a generic SaaS admin dashboard.

The product should communicate:
- Trust
- Calmness
- Clarity
- Warmth
- Professionalism
- Human connection between school, teachers, and families

## Visual Direction

Use a combination of:
- Editorial design principles
- Modern education product aesthetics
- Thoughtful typography
- Asymmetric layouts where appropriate
- Generous whitespace
- Strong visual hierarchy
- Subtle visual storytelling

Persian must be treated as a first-class design language. Never treat RTL as an afterthought.

## Avoid Generic AI UI Patterns

Do not automatically:
- Wrap every section in a card
- Use card grids for every dashboard
- Add decorative gradients
- Add glassmorphism
- Use excessive shadows
- Use unnecessary borders and dividers
- Add oversized rounded corners everywhere
- Repeat identical layouts across all pages
- Add decorative icons without functional meaning
- Use charts without a meaningful purpose
- Create excessive KPI cards
- Use purple/blue gradients typical of AI-generated interfaces
- Add emojis to professional UI elements

Do not use a generic dashboard template as the foundation of the product.

## Layout Principles

- Every page must have a layout appropriate to its purpose.
- Prioritize the user's primary task over decoration.
- Use whitespace intentionally.
- Use visual hierarchy instead of unnecessary containers.
- Tables and data-heavy interfaces must remain readable.
- Teacher workflows must be optimized for mobile and speed.
- Admin workflows must be optimized for clarity and efficient data management.
- Responsive behavior must be intentionally designed for desktop, tablet, and mobile.

## Design System

Use the project's design tokens for:
- Colors
- Typography
- Spacing
- Radius
- Shadows
- Borders
- States

Do not introduce random colors or inconsistent spacing.

Primary palette:
- Navy: #173B57
- Teal: #159A91
- Amber: #F4A340
- Paper: #F4F1E9
- Sage: #E3EAE7
- Charcoal: #282F36

Use Vazirmatn as the primary Persian font.

## Interaction Quality

Every interaction must have:
- Clear feedback
- Loading states
- Empty states
- Error states
- Success states
- Disabled states when applicable

Prefer meaningful micro-interactions over unnecessary animations.

## Design Process

Before implementing a new major page:

1. Identify the user and their primary task.
2. Identify the most important information on the page.
3. Propose a distinctive layout.
4. Avoid reusing the same page structure unnecessarily.
5. Implement the page.
6. Review the page visually in a real browser.
7. Refine spacing, typography, hierarchy, and interaction.

Do not consider a page complete merely because it compiles or passes tests.

Visual quality and usability are part of completion criteria.
