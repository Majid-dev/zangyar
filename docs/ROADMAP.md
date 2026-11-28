# ZangYar Roadmap

This roadmap separates product/design decisions from implementation work. Product and domain design is approved; Phase 2 establishes the application foundation before domain schema and business workflows are implemented.

## Phase 1 — Product and domain design

**Status:** Complete

- Review product scope and personas.
- Define school tenancy and membership model.
- Define academic-year, classroom, student, guardian, enrollment, attendance, activity, notification, and audit domains.
- Document ERD, ownership, cardinality, constraints, indexes, and lifecycle rules.
- Identify unresolved decisions and risks.
- Confirm role, enrollment-transfer, notification, guardian, calendar, and retention policies.
- Record confirmed decisions: one role per school membership, classroom transfers with effective-dated enrollments, admin-configurable attendance SMS triggers, and unique normalized guardian mobile numbers per school.

**Exit criteria:** Product and data-model documents approved; unresolved decisions that affect schema are resolved or explicitly deferred with an accepted design.

## Phase 2 — Foundation and project bootstrap

**Status:** Complete

- Initialize the Next.js App Router project with strict TypeScript.
- Configure Tailwind, RTL layout, Vazirmatn, and ZangYar visual tokens.
- Configure Docker Compose PostgreSQL.
- Configure Drizzle and environment-variable conventions.
- Establish Better Auth integration boundary without implementing domain workflows.
- Add health check and baseline test/type/lint/build commands.
- Add initial global identity/session schema and the Phase 3 server authorization boundary.

**Exit criteria:** Application starts, PostgreSQL starts, configuration is validated, and baseline checks pass. Verified on 2026-11-18: PostgreSQL healthy; `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm db:check`, and `corepack pnpm build` pass.

## Phase 3 — Authentication, memberships, and tenant authorization

**Status:** Complete

- Implement global user/session integration.
- Implement school membership and role checks.
- Implement active-school resolution from verified membership.
- Add server-side authorization helpers.
- Add negative cross-tenant access tests.
- Add audit events for membership and school access changes.
- Add membership queries and Server Actions with Zod validation.

**Completed in this phase slice:** Better Auth Drizzle adapter wiring; tenant-scoped membership listing, creation, and status changes; membership audit events; self-status-change protection; authorization unit tests.

### Authentication foundation and demo tenant

- Mobile-number login identity through Better Auth's phone-number plugin, with one canonical normalization path and password-based sign-in.
- Persian RTL login surface in the public `(auth)` route group, logout control in the authenticated shell, and unauthenticated redirect to `/login`.
- Idempotent development-only demo tenant seed wired as `db:seed:demo`, refusing production and non-local databases before any write.
- Persisted auth coverage: mobile login success and failure, seed idempotency and password preservation, tenant isolation, and role-escalation and platform-access denial, run through `test:integration:auth`.

### Teacher registration and approval

- School Admin authorizes a mobile number only: list searched by name, mobile, and personnel code, filtered by derived status, with the number correctable or deletable while unclaimed.
- Public registration at `/register`: number, OTP verification, then the teacher supplies their own name, optional personnel code, and password.
- Approval gate on membership status: a registered teacher is `PENDING_ADMIN_APPROVAL` and reaches no school resource until approved. Approval, rejection, deactivation, and reactivation are one guarded transition — approving a pending teacher *is* activating them — available from the teachers table as well as the teacher's page, with the actions derived from a single transition matrix.
- Deleting an unclaimed authorization removes the row outright and leaves nothing behind; a claimed one is retained and ends through deactivation.
- One global identity per mobile number, with a `TEACHER` membership and a school-local profile per authorizing school.
- Persisted coverage via `test:integration:teachers`, including transaction atomicity for identity creation, a proof that a registration cannot reference another school's membership, and a proof that deleting an authorization orphans nothing and stays on the audit trail.

### OTP verification infrastructure

- Provider-independent OTP service: `OtpProvider` interface, configuration-selected implementation, and a Development-only fixed-code provider.
- Purpose-specific challenges (`TEACHER_REGISTRATION`, `LOGIN`, `PASSWORD_RESET`) with keyed-hashed storage, expiry, attempt ceilings, resend cooldown, and per-number rate limiting.
- Production gate: the fixed-code provider is refused at startup, with no override; a missing provider fails closed at request time.
- Teacher registration requires a valid code before any identity is created; OTP login and password reset are wired end to end.
- Persisted coverage via `test:integration:otp`.

### Account settings and school switching

- Account control in the application shell for every signed-in user: avatar with initials, name, school-level role, and the active school; a Settings item; and sign-out.
- Dropdown items: school switching for teachers with more than one school only (School Admins and single-school teachers never see it), Settings, and sign-out. Popover on desktop, bottom sheet on mobile, with Escape and click-outside closing and focus returning to the trigger.
- School switching resolves the target against the user's verified active memberships server-side and persists the choice as a preference cookie that can only ever select among them (ADR-029). Sign-out clears it along with the session.
- `/settings`: edit first and last name (written to the account and to the active school's teacher profile), read-only mobile number, and a password change requiring the current password with per-field visibility toggles.
- Persisted coverage via `test:integration:account`, including forged preference and cross-user switch attempts.

**Remaining:** a real SMS provider (the `sms` provider name is reserved and currently refused), expired-challenge cleanup, and Platform Admin operations. See the known authorization gaps in `docs/ARCHITECTURE.md`.

**Exit criteria:** Protected operations reject unauthenticated users, invalid memberships, wrong roles, wrong tenants, and unauthorized resource access.

## Phase 4 — Schools and academic management

**Status:** Complete

- Implement school configuration and status.
- Implement academic years and transitions.
- Implement grades, subjects, and classrooms.
- Implement teacher memberships and classroom assignments.
- Add same-tenant composite constraints and indexes.
- Add school/academic management Zod schemas, queries, Server Actions, audit events, and authorization tests.

**Completed:** School configuration/status operations; guarded academic-year lifecycle; active grade/subject catalog; classroom creation; active same-tenant teacher assignment; assignment date-window and duplicate protection; tenant-scoped queries; audit coverage; admin UI routes/forms; inactive/archived filtering; batched classroom-assignment loading; persisted integration coverage.

**Exit criteria verification (2026-11-18):** A School Admin can configure an academic year and assign teachers to classrooms without cross-tenant relationships. Verified by passing unit tests, typecheck, lint, Drizzle check, production build, clean migration test, and isolated persisted Phase 4 integration tests (40 tests passed).

Migration and persisted test commands: `corepack pnpm db:test-clean` and `corepack pnpm test:integration:phase4`.

**Exit criteria:** A School Admin can configure an academic year and assign teachers to classrooms without cross-tenant relationships.

## Phase 5 — Students, guardians, and enrollment

**Status:** Complete

- Implement school-local student records.
- Implement guardian contacts and student-guardian relationships.
- Implement enrollment into academic-year classrooms.
- Implement effective-dated classroom transfers with non-overlapping enrollment ranges.
- Add validation for active enrollment policy.
- Add effective-dated enrollment history and non-overlapping classroom transfer behavior.
- Add lifecycle and historical-record behavior.

**Exit criteria:** Students can be enrolled with multiple guardians and all relationships are tenant-safe and auditable. Verified by passing unit, authorization, and persisted integration tests (52 tests passed), and visual verification of tenant-scoped roster and student list.

## Phase 6 — Daily attendance

**Status:** In progress

**Completed slice:** Tenant/date-authorized roster, daily session/record persistence, four-status upsert, same-day teacher restriction, correction audit events, Server Action wiring, data-backed attendance dashboard summary, and isolated Phase 6 integration wrapper/test.

**Completed mandatory hours:** a teacher's mandatory weekly hours are set in the approval dialog and editable from the teacher's page; a teacher with zero or missing hours is reported as awaiting hours rather than active and cannot be given timetable slots.

**Completed scheduling foundation:** teacher weekly mandatory hours per academic year; weekly timetable with teacher-subject-class assignments; school operating days; a single ordered period list per school; shift configuration (morning, afternoon, or rotating weekly) with a rotation base date, edited on `/academics/periods`; a submission deadline after each period; the applicable shift for any date calculated from the configuration and its anchor; and attendance records linked to classroom, students, students' enrollments, period, teacher, subject, date, and timetable assignment. Non-operating days and dates whose weekday does not match the assigned period are refused for attendance, as are periods outside the applicable shift.

**Completed timetable assignment interface:** the assignment grid at `/academics/timetable` draws one classroom's week as days by periods, with each period shown as its two teaching hours and only the school's operating days as rows. Cells are selected and then given a teacher and a subject in one form, so a whole period, a single hour, and a period split between two teachers with two different subjects are all reachable the same way, and the teacher and subject pickers are searchable. A period whose two hours hold the same teacher and subject is drawn as one joined cell labelled "two hours" and splits back into its hours when edited; a period whose hours differ shows each hour's own teacher and lesson. The teacher list offers only teachers with recorded mandatory hours and shows each one's remaining capacity; assigned, partially assigned, empty, and conflicting cells are visually distinct. `assignTimetableHours` refuses a teacher already teaching a selected hour elsewhere, an assignment past the teacher's mandatory hours, a teacher with no recorded figure, and an hour on a non-operating day, while counting a re-saved cell as no new hour. A classroom no longer names a liable (homeroom) teacher: its teachers are the hours inside it, and teacher access to a roster follows from holding one. Assigned-hours reporting counts each assignment as one hour for the teacher it names.

**Completed alternating attendance responsibility:** when a period's two hours name two different teachers, they alternate weekly. The teacher holding the period's first hour takes the week the academic year opens, and the two hand the period back and forth from there, each recording the entire period — both hours, both subjects — in their own weeks; the other teacher is refused for that day. The rule is a pure function of the date, anchored on the academic year's start date and counted in whole school weeks from the week it opens, so it does not reset in January and needs no special case for leap years, month boundaries, or holidays. A period one teacher holds outright does not alternate. The rotation never changes teaching hours, since those are counted from the timetable rather than from who registers. Attendance is one register per classroom period per date, and the interface shows whose week a split period is and which week of the year it is.

**Completed per-shift period schedules and settings defaults:** a period carries its times in each of the school's shifts, so a rotating school runs a different daily schedule in the morning and the afternoon and a fixed school shows only its own. Which pair applies on a date is resolved from the shift that date falls in, and the attendance submission deadline is measured from the period's end in that shift plus the grace period. The operating days preselect Saturday to Wednesday for a school that has never saved a week, and the rotation reference date defaults to the academic year's start date; both remain the admin's to change. The School Structure link to these settings points at `/academics/periods`, and the settings panel is laid out narrower than the periods panel so the periods get the width their two-shift times need.

**Completed teacher attendance workspace:** `/attendance` is the teacher's own day. Its periods are drawn as a run of tiles carrying the time, class, lesson(s), and — for a split period — whose week it is and which week of the year that is, so "why is this not mine" is answered on the tile rather than by a refusal. Each occurrence's standing is derived by one pure resolver, `resolveAttendanceWindow` in `src/features/attendance/window.ts`, from the instants the query resolved and the role asking: **upcoming** (before the bell), **open** (bell to the period's end), **inside the grace period** (past the end, inside the school's window), **expired**, **submitted**, and **closed**. A teacher may write between the bell and the lapse of the grace period; a School Admin is outside the window altogether, because correcting a register is their job (ADR-007) and "any school date" has to include the one being prepared. Both are refused before the bell, since a register for a period that has not happened is invented rather than taken.

The same resolver decides the interface's badges and the service's refusals, so a tile drawn as submittable is exactly one the server accepts. The register opens showing what was recorded — a correction starts from the truth, not from a fresh row of "present" — and the rows it changes are marked, counting only genuine edits so a first register does not report having changed the whole class. All four statuses (حاضر، غایب، تأخیر، موجه) are direct-selected per row with 44px targets, filtered by name or admission number, with "همه حاضر" and "همه غایب" bulk actions. Submission is a two-step gate: a summary states who is being recorded and how many statuses change, and only the confirmation writes. Wednesday-to-Wednesday duplicates are excluded on both sides — the button disables while a save is in flight, and the service upserts into the occurrence's single session. The deadline is shown, the register is mobile-first, and the day's tiles, counts, and confirmation update without a reload.

Two defects found while verifying this slice are fixed with it. The service read a period's timetable rows — which can carry several weekdays under one period id, and were ordered by hour alone — and decided the weekday from the first one, so a period meeting on two days refused the second as a weekday mismatch; the rows are now narrowed to the submitted weekday before the teacher pair, subjects, and window are decided from them. And the shell's mobile header could not shrink, pushing the whole page 44px wider than the phone on every screen; the lockup drops its tagline at that size and the attendance schedule strip contains its own paint, so nothing escapes the layout's clip.

**Completed role-based attendance views and administrator tooling:** the dashboard is now two shapes from one route. A School Admin gets the school's day as a ledger — how many of today's occurrences are registered, still open, or past their deadline unregistered, over real counts of active classes, students, and teachers, with a list of the occurrences still owed linked to each register. A teacher gets their own day: the periods the week handed them, ordered by urgency, with their own counts — assigned, submitted, pending, past deadline — and no school-wide figure at all, because the field is not in a teacher's payload rather than merely hidden. Both are built from the role-scoped slot list the attendance page itself uses, so neither can report an occurrence the register would refuse to open.

The administrator's attendance page gains filters for class, period, and submission status, held in the URL and applied on the server so a filtered view is a link. Class and period narrow the query; the submission status is applied to the resolved occurrences, because "missing" is a fact about a window rather than a column. The filters intersect, the class picker is searchable, a clear action appears once anything is set, and the bar reports how many of the day's occurrences it is showing. A teacher sees no filter bar, since their day is already their own.

A register now discloses when an administrator has changed it. `attendance_records` carries a nullable `admin_edited_at` / `admin_edited_by_membership_id` pair, set the first time an admin changes an already-recorded status and never cleared, so the "اصلاح توسط مدیر" tag on the row stays true through any number of later edits; a first submission by an admin is not tagged, and `recorded_by_membership_id` is no longer overwritten, so the teacher who took the register is still named. Selection of a schedule tile no longer recolours its status bullet or its status word — selection is carried by the border and surface, and the semantic colours are the same selected, hovered, or focused. The informational line for a split period now names the *next* week's teacher rather than the current one: the other teacher is derived as "whoever is not this week's", which is the same person in both weeks, where the previous index-based lookup named the reader themselves in the partner's own week.

**Completed administrator day view, grade scope, and filter/card separation:** the administrator's schedule now opens on the classes actually in session — `isAttendancePeriodActive` compares the period's resolved instants against the school's clock, so a rotating school's afternoon week is read from the afternoon schedule and no hour is hardcoded — with an explicit toggle to the whole day and an empty state that distinguishes "no class is in session now" from "nothing is scheduled" and "this grade has no classes". Grade is a real scope with no "all grades" option: it is a single select that defaults to the school's first grade with classes, ordered by the grade's own `sortOrder`, and the class picker offers only that grade's classes, so a class from another grade can no longer be selected into an empty list.

Opening a card no longer touches the filters. The chosen occurrence travels as `openSlotKey` (`classroomId:periodId`) and is resolved separately from `classroomId` / `periodId`, because opening a register and narrowing a list are different acts — previously the card's link *was* the filter pair, so clicking a tile silently narrowed the day to that tile and the list came back describing only the card that had just been opened. Filters change only from the filter bar, the bar clears the open register when it rewrites the list, and the teacher dashboard's "Next Action" no longer offers "Add Student", a link that only ever led a teacher to a permission refusal.

- Implement school-local business-date handling. (Completed.)
- Create or load one daily session per classroom/date. (Superseded by per-hour sessions; completed.)
- Record the four attendance statuses. (Completed.)
- Enforce session and record uniqueness. (Completed.)
- Implement teacher assignment authorization. (Completed via timetable-hour access.)
- Add correction/finalization behavior after policy confirmation. (Correction is implemented and audited; a submission window is enforced per period.)
- Read the school's attendance notification policy and create eligible transactional outbox entries with recipient/message snapshots. (Completed.)
- Add attendance reports and expand audit-read coverage. (Assigned-hours reporting is implemented; per-student attendance reports remain. The teacher-facing register is complete: schedule, window states, roster with statuses, confirmation, and mobile layout.)

**Exit criteria:** Authorized staff can record and review daily attendance, while duplicate sessions, invalid enrollments, and cross-tenant access are rejected.

## Phase 7 — Classroom activities and reports

**Status:** Planned

- Implement activity categories and classroom activities.
- Record student-level activity outcomes.
- Add daily and monthly attendance reports.
- Add basic classroom and student summaries.
- Keep notification behavior independently configurable.

**Exit criteria:** Teachers can record activities for assigned classrooms and School Admins can access tenant-scoped reports.

## Phase 8 — Notification outbox and Mock SMS processing

**Status:** Planned

- Define the `SmsProvider` interface.
- Implement Mock SMS Provider.
- Consume pending attendance outbox records created by Phase 6.
- Implement claiming, retries, delivery idempotency, and provider attempt logs.
- Add notification status visibility and audit events.

**Exit criteria:** Attendance submission is independent of delivery, pending messages are retried safely, and duplicate sends are prevented.

## Phase 9 — Hardening and operational readiness

**Status:** Planned

- Expand tenant-isolation and authorization tests.
- Add end-to-end teacher attendance tests.
- Add database constraint and transaction tests.
- Review audit coverage and sensitive data access.
- Validate timezone and Persian-calendar behavior.
- Add production logging, error handling, and operational documentation.
- Select and evaluate a real Iranian SMS provider only after requirements are confirmed.

**Exit criteria:** MVP security, data-integrity, workflow, and operational checks are documented and passing.

## Deferred scope

- Parent portal and parent authentication
- Native mobile applications
- Online payments and subscription billing
- Advanced analytics and data warehouse
- AI-based student performance analysis
- Microservices, Kubernetes, Redis, and external queue infrastructure
- Real SMS provider integration before provider selection
