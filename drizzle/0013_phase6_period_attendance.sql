-- Task 6: one attendance register per period, with weekly alternating
-- responsibility for a period whose two hours belong to two teachers.
--
-- Task 4 made attendance per teaching hour: a split period was two sessions, one
-- per hour, each naming its own teacher and subject. The product's rule for a
-- split period is different — one teacher owns the *whole* period for a given
-- week and the two alternate weekly — and that is a fact about the period, not
-- about either hour. Two per-hour registers cannot express it: there would be two
-- sessions to hand between the teachers, two deadlines, and two places a register
-- could disagree about whether the period had been taken.
--
-- So the session is re-keyed from the timetable hour to the period.
-- `attendance_sessions` loses `timetable_entry_id` and `subject_id` and gains
-- `period_id`. The subject goes because a split period has two of them and the
-- register is for the period, not a lesson: naming one would have to pick a winner
-- between them, and the timetable already says which hour is which subject. The
-- responsible teacher stays on the session, now meaning "who the week handed this
-- period to" as well as "the period's only teacher". The uniqueness moves to
-- `(school_id, classroom_id, period_id, business_date)` — a class registers a
-- period once a day — and the reference follows to `school_periods`.
--
-- Nothing records the rotation on the timetable: the anchor is the academic year's
-- `start_date`, which is already stored, and the alternation is derived from it on
-- read. Storing a week's owner on each row would be a second source of truth for a
-- fact that is a pure function of a date the school has already fixed.
--
-- Existing attendance rows are deleted rather than migrated: the new columns are
-- NOT NULL and no per-hour row can say what a period-level register should. The
-- task that owns this migration treats current data as disposable; from here the
-- shape is what matters.

DELETE FROM "notification_logs";
--> statement-breakpoint
DELETE FROM "notification_outbox";
--> statement-breakpoint
DELETE FROM "attendance_records";
--> statement-breakpoint
DELETE FROM "attendance_sessions";
--> statement-breakpoint
ALTER TABLE "attendance_sessions" DROP CONSTRAINT "attendance_sessions_school_entry_date_unique";
--> statement-breakpoint
ALTER TABLE "attendance_sessions" DROP CONSTRAINT "attendance_sessions_school_timetable_entry_fk";
--> statement-breakpoint
ALTER TABLE "attendance_sessions" DROP CONSTRAINT "attendance_sessions_school_subject_fk";
--> statement-breakpoint
ALTER TABLE "attendance_sessions" DROP COLUMN "timetable_entry_id";
--> statement-breakpoint
ALTER TABLE "attendance_sessions" DROP COLUMN "subject_id";
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "period_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_period_fk" FOREIGN KEY ("school_id","period_id") REFERENCES "public"."school_periods"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_period_date_unique" UNIQUE("school_id","classroom_id","period_id","business_date");
