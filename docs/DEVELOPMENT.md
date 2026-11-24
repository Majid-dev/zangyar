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

Mobile sign-in is password-based or by one-time code. A phone number must be
verified before it can sign in; verification state is set by an authorized
provisioning path such as the development seed or teacher provisioning.

One-time codes are delivered by the **Development** provider, which issues a
configured fixed code instead of sending an SMS. **The code is written to the
server log, not to the browser** — watch the `corepack pnpm dev` terminal for a
line like:

```text
[otp:development] purpose=TEACHER_REGISTRATION mobile=0912***789 school="..." code=123456 expiresIn=120s
```

The default code is `123456`. Override it with `OTP_DEV_FIXED_CODE`. Tune the
lifetime, attempt ceiling, resend cooldown, and per-number rate limit with
`OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS`, and
`OTP_REQUEST_MAX`.

This provider is refused in production: an application booted with
`NODE_ENV=production` and `OTP_PROVIDER=development` fails at startup, and with
no provider configured it refuses to issue codes rather than inventing them.
Selecting `OTP_PROVIDER=sms` is reserved and also refused, because no SMS provider
is implemented yet. Better Auth's own phone-number OTP routes stay disabled; the
product's OTP surface is `/otp/*`.

## Adding a teacher

Sign in as the School Admin and open **دبیران** (`/teachers`).

1. **افزودن شماره همراه** (`/teachers/new`) asks for a mobile number only — no
   name, no personnel code. Persian digits, `+98`, and `0098` spellings are all
   accepted and normalized to `09XXXXXXXXX`. After a successful submit, **افزودن
   شماره دیگر** returns a fresh form for the next number.
2. Submitting only *authorizes the number*: no account, no membership, and nothing
   is sent. There is no invitation link, because there is nothing to send and no
   SMS provider. The admin's registration of the number is the invitation.
3. The teacher goes to **ثبت‌نام** (`/register`) — linked from the login page —
   enters that number, receives a code (read it from the server log, below),
   proves it, and supplies their own name, optional personnel code, and password.
4. Their registration lands in **در انتظار تأیید مدیر**. They can sign in, but reach
   no school resource until the admin approves.
5. The teacher detail page (`/teachers/[id]`) shows the number, the details the
   teacher supplied, and the verification state. The access decision — approve,
   reject, deactivate, or reactivate — is the same control here and in the
   teachers table, since both render the actions the transition matrix derives
   for the teacher's current status. Before the teacher registers, both offer to
   correct or delete the number instead.

Registration codes expire after `OTP_TTL_SECONDS` (default 120). A School Admin
never sets a teacher's password and cannot change a teacher's role. The personnel
code is the teacher's own detail: they supply it (optionally) at registration, and
an admin can only correct it afterwards. A mobile number may be authorized once per
school; deleting an unclaimed authorization frees the number to be re-added, while a
claimed one can no longer be corrected or deleted and ends through deactivation.

## Signing in with a one-time code

The login page offers two paths: mobile + password, and mobile + one-time code.
Choose **کد یک‌بارمصرف**, enter the mobile number, press **ارسال کد تأیید**, then read
the code from the server log. The request response is identical whether or not the
number has an account, so it cannot be used to discover which numbers are
registered.

**بازیابی گذرواژه** (`/reset-password`) uses the same code flow to set a new
password; a successful reset also revokes that account's other sessions.

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
corepack pnpm test:integration:teachers # teacher registration, approval, and tenant isolation
corepack pnpm test:integration:otp     # OTP issuance, verification, and the production gate
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
