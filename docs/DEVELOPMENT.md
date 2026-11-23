# ZangYar Local Development

## Prerequisites

- Node.js LTS and Corepack (for `pnpm`)
- Docker (for local PostgreSQL)

## First run

```bash
corepack pnpm install
docker compose up -d postgres
cp .env.example .env.local
corepack pnpm db:migrate
NODE_ENV=development corepack pnpm db:seed:demo
corepack pnpm dev
```

`db:seed:demo` refuses to run unless `NODE_ENV` is `development`, so set it for the
seed command. The seed also refuses a non-local database and refuses production
under any setting, before any write.

Open http://localhost:3000. The root route redirects to `/dashboard`, which
redirects an unauthenticated visitor to `/login`.

## Demo tenant

`corepack pnpm db:seed:demo` bootstraps a demo school and its School Admin so a
development environment is usable immediately.

| | |
|---|---|
| School | `مدرسه نمونه زنگ‌یار` (slug `demo-school`) |
| School Admin | `مدیر مدرسه آزمایشی` |
| Login | `09120000000` |
| Password | `ZangYar@12345` |

Login identity is the Iranian mobile number. Every common spelling is accepted
and normalized to `09XXXXXXXXX` (`+98…`, `0098…`, `9XXXXXXXXX`, and Persian or
Arabic digits).

### Seed rules

- **Development only.** The seed refuses to run when `NODE_ENV` is not
  `development`, when the database host is not local, or in production under any
  setting. The refusal happens before the first write.
- **Idempotent.** Running it repeatedly never duplicates a school, account, or
  membership. It never resets an existing password and never overwrites a
  profile value an operator changed. A suspended or revoked demo membership is
  restored to active rather than duplicated.
- **No platform privilege.** The seed creates no `platform_admins` row, and no
  School Admin path can grant platform-level access.
- The password is read from `DEMO_ADMIN_PASSWORD` when set. The value above is a
  local default only; it is never surfaced by an application route, printed by
  the seed, or written to production configuration.

Override any demo value for a local scenario with the matching environment
variable (`DEMO_SCHOOL_NAME`, `DEMO_SCHOOL_SLUG`, `DEMO_ADMIN_NAME`,
`DEMO_ADMIN_MOBILE`, `DEMO_ADMIN_PASSWORD`, …).

### OTP and SMS

Mobile sign-in is password-based. The phone-number OTP endpoints are disabled
because no SMS provider is configured yet, and a phone number must be verified
before it can sign in. Verification state is set by an authorized provisioning
path such as the development seed or teacher provisioning.

## Adding a teacher

Sign in as the School Admin and open **دبیران** (`/teachers`).

1. **افزودن دبیر** (`/teachers/new`) asks for a first name, last name, and mobile
   number, plus an optional personnel code. Persian digits, `+98`, and `0098`
   spellings are all accepted and normalized to `09XXXXXXXXX`.
2. Submitting creates the account, the `TEACHER` membership, and a one-time
   activation invitation. The form then shows the activation link, which is the
   only time it is visible: only the token's hash is stored, so the admin must copy
   the link and pass it to the teacher through whatever channel they already use.
   There is no SMS or email delivery yet.
3. The teacher opens the link and sets their own password. Until then the account
   exists but **cannot** sign in, because no credential is linked.
4. The teacher detail page (`/teachers/[id]`) shows the invitation status, resends
   or revokes an invitation, edits basic information, and deactivates or
   reactivates the teacher. Resending invalidates the previous link.

Activation links expire after `TEACHER_INVITATION_TTL_HOURS` (default 72). A
School Admin can never set a teacher's password or change a teacher's role.

## Verification

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm db:check
corepack pnpm build
```

Integration suites run inside an ephemeral, freshly migrated database so they
never touch local development data:

```bash
corepack pnpm db:test-clean            # migrations apply cleanly to an empty database
corepack pnpm test:integration:auth    # auth, demo seed, and tenant isolation
corepack pnpm test:integration:teachers # teacher provisioning and invitation lifecycle
corepack pnpm test:integration:phase4
corepack pnpm test:integration:phase5
corepack pnpm test:integration:phase6
```

Persisted tests run only when `RUN_DB_INTEGRATION_TESTS=1` is set; the wrapper
scripts above set it themselves. Unit tests run by default.

There is no end-to-end (Playwright) suite configured in this repository.

## Legacy bootstrap scripts

`scripts/create-local-admin.mjs` and `scripts/seed-local-academics.mjs` predate
the demo seed. They resolve an account by email and therefore only apply to
existing email-based accounts. Prefer `corepack pnpm db:seed:demo` for a new
environment.
