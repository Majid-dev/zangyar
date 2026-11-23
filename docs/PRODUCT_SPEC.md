# ZangYar Product Specification

## Purpose

ZangYar (زنگ‌یار) is a Persian, RTL school-management SaaS for schools in Iran. It connects school staff with families by helping teachers record daily classroom activity and attendance and by sending eligible notifications to guardians through SMS.

The first release is a web application. Parents and guardians are contact records and SMS recipients; they do not authenticate in the MVP.

## Product goals

- Give school staff a simple, reliable workflow for daily attendance.
- Keep school data isolated across tenants.
- Give school administrators control over academic structure, people, reports, and notification settings.
- Preserve attendance, activity, notification, and audit history across academic-year transitions.
- Keep notification delivery independent from attendance submission.

## Personas and permissions

### Platform Admin

Platform-level operator who can manage schools, inspect platform statistics, and manage platform configuration. Platform Admin authorization is separate from school membership.

### School Admin

A staff member authorized within a school to manage school configuration, memberships, academic years, grades, classrooms, subjects, students, guardians, enrollments, reports, notifications, and audit history.

### Teacher

A school member who can access assigned classrooms, view enrolled students, record attendance, record classroom activities, and view records for assigned classrooms.

### Guardian

A school-owned contact record associated with one or more students. A guardian may be eligible for SMS notifications. Guardians do not have accounts or portal access in the MVP.

## Functional requirements

### School and membership management

- Register and configure a school.
- Maintain school status: active, suspended, or archived.
- Associate global user accounts with one or more schools through memberships.
- Assign exactly one school-level role per membership: `SCHOOL_ADMIN` or `TEACHER`; a membership cannot hold both roles.
- Resolve active school context only from authenticated membership.
- Keep Platform Admin authorization outside school-level roles.

### Academic management

- Create and close academic years.
- Configure school-local grades and subjects.
- Create classrooms within an academic year.
- Assign teachers to multiple classrooms.
- Support multiple teachers per classroom.
- Keep subjects optional for classroom-teacher assignments; subject-specific attendance may require them later.
- Close an academic year as one coordinated operation that archives active enrollments in that year, leaves student global status unchanged, rejects new operations for the closed year, and preserves all historical records.

### Student and guardian management

- Create school-local student records.
- Store an optional national ID, unique within the school when provided.
- Create school-local guardian contact records.
- Associate multiple guardians with a student.
- Associate one guardian with multiple students.
- Identify primary, emergency, and SMS-recipient relationships.
- Enroll students into classrooms for an academic year.
- Support classroom transfers during an academic year while preserving the student's enrollment history and attendance context.
- Allow explicit reactivation of withdrawn, graduated, or archived profiles without reopening prior enrollments or assigning a class.
- Manage guardian contact details, relationship type, primary flag, SMS flag, and emergency flag through one profile edit submission.

### Attendance

- Record daily attendance by classroom and school-local business date.
- Support statuses: `PRESENT`, `ABSENT`, `LATE`, and `EXCUSED`.
- Ensure at most one daily attendance session per classroom and date.
- Ensure one attendance record per enrolled student per session.
- Permit same-day teacher corrections for assigned classrooms.
- Permit School Admin corrections for any school date.
- Audit every attendance correction.
- Design the session model for future lesson-level attendance.

### Classroom activities

- Create classroom activities with a date, category, title, and description.
- Record student-level outcomes for an activity.
- Support examples such as participation, answered a question, completed homework, did not complete homework, and positive classroom performance.
- Keep activity notification behavior configurable and separate from attendance logic.

### Notifications

- Allow School Admins to configure which attendance events trigger SMS from the admin panel.
- Store notification policy per school; the initial policy controls attendance statuses such as `PRESENT`, `ABSENT`, `LATE`, and `EXCUSED`.
- Create notification outbox records transactionally with the source domain event and the policy decision in effect at submission time.
- Deliver SMS asynchronously through an abstract provider interface.
- Use a Mock SMS Provider during development and testing.
- Record attempts, provider responses, retry state, and delivery history.
- Prevent duplicate delivery with an idempotency key.

### Reports and audit

- Provide basic daily and monthly attendance reporting.
- Provide attendance summaries by classroom, student, and academic year.
- Preserve audit records for sensitive and significant actions.
- Do not expose data from another school.

## Core user stories

- As a School Admin, I can configure my school and academic year so staff can operate against the correct class structure.
- As a School Admin, I can invite or assign teachers to my school without changing their global identity.
- As a School Admin, I can create a classroom and assign several teachers to it.
- As a School Admin, I can register a student, add multiple guardians, and enroll the student in a classroom.
- As a Teacher, I can open one of my assigned classrooms and record attendance quickly for the current school-local date.
- As a Teacher, I can record a classroom activity and mark outcomes for enrolled students.
- As a School Admin, I can review and correct attendance while retaining an audit trail.
- As a Guardian contact, I can receive an SMS when the school has enabled an eligible notification for my student.
- As a Platform Admin, I can manage schools without being granted access to school-level operations by implication.

## Core workflows

### School onboarding

1. Register a school.
2. Create or invite its first School Admin.
3. Configure school profile and timezone.
4. Create or activate an academic year.
5. Add memberships, grades, classrooms, subjects, students, and guardians.

### Academic-year setup

1. Create an academic year with start and end dates.
2. Create grades and subjects.
3. Create classrooms for the academic year.
4. Assign teachers.
5. Enroll students.
6. Process classroom transfers by closing the prior enrollment and creating a new effective-dated enrollment.
7. Close the year in one transaction: archive active enrollments at year end, hide closed-year classes from operational views, and preserve historical records without changing student global status.

### Daily attendance

1. Teacher or School Admin opens an assigned classroom.
2. The system loads or creates the single daily session for the school-local date.
3. The operator records one status per currently enrolled student.
4. The transaction stores attendance and eligible notification outbox entries together.
5. A separate process sends SMS and records provider results.
6. Authorized corrections create audit events.

### Student and guardian management

1. Create or update the school-local student record.
2. Create or reuse a guardian contact within the school.
3. Link one or more guardians to the student.
4. Mark SMS eligibility and primary contact relationships.
5. Create or update the academic-year enrollment. Closed or archived academic years are never offered in new enrollment choices.
6. Display Persian/Jalali dates at the UI boundary while retaining Gregorian ISO dates in storage and form submission.

## Business rules

1. A school is the tenant root.
2. Users are global; school membership determines school-level access.
3. A membership has exactly one school-level role; School Admin and Teacher roles cannot coexist on one membership.
4. A client-supplied `schoolId` is never authorization evidence.
5. All school-owned reads and writes are tenant-scoped and server-authorized.
6. Teachers can access only assigned classrooms unless authorized as School Admin; a School Admin membership is not also a Teacher membership.
7. Historical academic-year records remain available after closure.
8. Classroom transfers create effective-dated enrollment history with no overlapping enrollments for the same student and academic year.
9. Daily attendance is unique by school, classroom, local date, and session kind.
10. Attendance records reference valid enrollments from the same school and classroom and must fall within the enrollment's effective period.
11. School Admins configure attendance notification triggers from the admin panel.
12. Attendance submission never waits for SMS delivery.
13. Only eligible guardians with a valid normalized mobile number receive notifications; a normalized mobile number is unique within a school.
14. Outbox processing is retryable and idempotent.
15. Business dates use the school's timezone; stored timestamps are timezone-aware.
16. User-facing Persian-calendar dates are converted to Gregorian dates before storage.
17. Operational records are archived rather than destructively deleted in the MVP.
18. Formal guardian-consent workflows are deferred; SMS eligibility is controlled through the student-guardian relationship.
19. Closed-year classes and new enrollment/class operations are excluded from operational workflows, but historical records remain available.
20. Student profile reactivation does not reopen historical enrollments or assign a class.

## MVP exclusions

- Parent or guardian portal
- Native mobile applications
- Payments and subscription billing
- Advanced analytics
- AI-based performance analysis
- Microservices, Kubernetes, Redis, or external queue infrastructure
- Real SMS provider integration before provider selection

## Future product questions

The following items are intentionally deferred and do not block the initial schema:

- Whether activity events should later be added to the configurable notification policy; the initial policy covers attendance events only.
- Formal guardian-consent workflow and detailed regulatory retention requirements.
- Whether the attendance correction policy should later add a finalization or historical correction window.
