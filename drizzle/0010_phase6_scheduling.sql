-- Phase 6: weekly timetable, shifts, working hours, and period-level attendance.
--
-- This migration replaces two things rather than adding alongside them.
--
-- `class_teachers` recorded that a teacher belonged to a classroom for a date
-- range, with an optional subject and a "primary" flag. That cannot express when
-- anyone teaches, how many hours a slot is worth, or which of two teachers owns a
-- shared hour, so the timetable tables below supersede it. The part of it that was
-- a real attribute of the class rather than an assignment — the homeroom teacher —
-- moves to `classrooms.homeroom_teacher_membership_id`.
--
-- `attendance_sessions` recorded one DAILY session per classroom per date, keyed
-- by a `session_kind` enum whose only other value was never used. Attendance is
-- per period now, identified by the timetable entry and dated, so the kind column
-- and its enum are dropped rather than left behind as a value nothing can produce.
--
-- Attendance rows are deleted before the reshape because the new session columns
-- are NOT NULL and no existing row can satisfy them. The task this migration
-- belongs to treats current data as disposable; from here the shape is what
-- matters.
DELETE FROM "notification_logs";
--> statement-breakpoint
DELETE FROM "notification_outbox";
--> statement-breakpoint
DELETE FROM "attendance_records";
--> statement-breakpoint
DELETE FROM "attendance_sessions";
--> statement-breakpoint
DROP TABLE "class_teachers";
--> statement-breakpoint
ALTER TABLE "attendance_sessions" DROP CONSTRAINT "attendance_sessions_school_classroom_date_kind_unique";
--> statement-breakpoint
ALTER TABLE "attendance_sessions" DROP COLUMN "session_kind";
--> statement-breakpoint
DROP TYPE "public"."attendance_session_kind";
--> statement-breakpoint
CREATE TYPE "public"."school_shift_kind" AS ENUM('MORNING', 'AFTERNOON', 'ROTATING');
--> statement-breakpoint
CREATE TYPE "public"."school_period_kind" AS ENUM('LESSON', 'BREAK');
--> statement-breakpoint
CREATE TYPE "public"."timetable_rotation" AS ENUM('NONE', 'WEEKLY_ALTERNATING');
--> statement-breakpoint
CREATE TABLE "school_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(120) NOT NULL,
	"kind" "school_shift_kind" DEFAULT 'MORNING' NOT NULL,
	"rotates_with_shift_id" uuid,
	"rotating_base_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_shifts_school_code_unique" UNIQUE("school_id","code"),
	CONSTRAINT "school_shifts_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "school_shifts_rotation_check" CHECK ((
    ("school_shifts"."kind" = 'ROTATING' and "school_shifts"."rotates_with_shift_id" is not null and "school_shifts"."rotating_base_date" is not null)
    or ("school_shifts"."kind" <> 'ROTATING' and "school_shifts"."rotates_with_shift_id" is null and "school_shifts"."rotating_base_date" is null)
  )),
	CONSTRAINT "school_shifts_not_self_rotating_check" CHECK ("school_shifts"."rotates_with_shift_id" is null or "school_shifts"."rotates_with_shift_id" <> "school_shifts"."id")
);
--> statement-breakpoint
CREATE TABLE "school_shift_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" "school_period_kind" DEFAULT 'LESSON' NOT NULL,
	"label" varchar(64),
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"hour_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_shift_periods_shift_ordinal_unique" UNIQUE("shift_id","ordinal"),
	CONSTRAINT "school_shift_periods_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "school_shift_periods_school_id_shift_unique" UNIQUE("school_id","id","shift_id"),
	CONSTRAINT "school_shift_periods_time_order_check" CHECK ("school_shift_periods"."start_time" < "school_shift_periods"."end_time"),
	CONSTRAINT "school_shift_periods_ordinal_check" CHECK ("school_shift_periods"."ordinal" > 0),
	CONSTRAINT "school_shift_periods_hours_check" CHECK ((
    ("school_shift_periods"."kind" = 'LESSON' and "school_shift_periods"."hour_count" > 0) or ("school_shift_periods"."kind" = 'BREAK' and "school_shift_periods"."hour_count" = 0)
  ))
);
--> statement-breakpoint
CREATE TABLE "school_operating_days" (
	"school_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_operating_days_school_id_shift_id_day_of_week_pk" PRIMARY KEY("school_id","shift_id","day_of_week"),
	CONSTRAINT "school_operating_days_day_of_week_check" CHECK ("school_operating_days"."day_of_week" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "teacher_weekly_hour_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"teacher_membership_id" uuid NOT NULL,
	"required_weekly_hours" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_weekly_hour_requirements_membership_year_unique" UNIQUE("school_id","teacher_membership_id","academic_year_id"),
	CONSTRAINT "teacher_weekly_hour_requirements_hours_check" CHECK ("teacher_weekly_hour_requirements"."required_weekly_hours" >= 0)
);
--> statement-breakpoint
CREATE TABLE "timetable_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"classroom_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"subject_id" uuid NOT NULL,
	"primary_teacher_membership_id" uuid NOT NULL,
	"partner_teacher_membership_id" uuid,
	"rotation" "timetable_rotation" DEFAULT 'NONE' NOT NULL,
	"rotation_base_date" date,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timetable_entries_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "timetable_entries_classroom_slot_unique" UNIQUE("school_id","classroom_id","shift_id","day_of_week","period_id"),
	CONSTRAINT "timetable_entries_day_of_week_check" CHECK ("timetable_entries"."day_of_week" between 1 and 7),
	CONSTRAINT "timetable_entries_rotation_check" CHECK ((
    ("timetable_entries"."rotation" = 'WEEKLY_ALTERNATING' and "timetable_entries"."partner_teacher_membership_id" is not null and "timetable_entries"."rotation_base_date" is not null)
    or ("timetable_entries"."rotation" <> 'WEEKLY_ALTERNATING' and "timetable_entries"."partner_teacher_membership_id" is null and "timetable_entries"."rotation_base_date" is null)
  )),
	CONSTRAINT "timetable_entries_distinct_teachers_check" CHECK ("timetable_entries"."partner_teacher_membership_id" is null or "timetable_entries"."partner_teacher_membership_id" <> "timetable_entries"."primary_teacher_membership_id")
);
--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "attendance_submission_minutes" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "homeroom_teacher_membership_id" uuid;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "timetable_entry_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "subject_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "teacher_membership_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "submission_deadline_at" timestamp with time zone NOT NULL;
--> statement-breakpoint
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_attendance_submission_minutes_check" CHECK ("school_settings"."attendance_submission_minutes" >= 0);
--> statement-breakpoint
ALTER TABLE "school_shifts" ADD CONSTRAINT "school_shifts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_shifts" ADD CONSTRAINT "school_shifts_school_rotates_with_fk" FOREIGN KEY ("school_id","rotates_with_shift_id") REFERENCES "public"."school_shifts"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_shift_periods" ADD CONSTRAINT "school_shift_periods_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_shift_periods" ADD CONSTRAINT "school_shift_periods_school_shift_fk" FOREIGN KEY ("school_id","shift_id") REFERENCES "public"."school_shifts"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_operating_days" ADD CONSTRAINT "school_operating_days_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_operating_days" ADD CONSTRAINT "school_operating_days_school_shift_fk" FOREIGN KEY ("school_id","shift_id") REFERENCES "public"."school_shifts"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "teacher_weekly_hour_requirements" ADD CONSTRAINT "teacher_weekly_hour_requirements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "teacher_weekly_hour_requirements" ADD CONSTRAINT "teacher_weekly_hour_requirements_school_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "teacher_weekly_hour_requirements" ADD CONSTRAINT "teacher_weekly_hour_requirements_school_membership_fk" FOREIGN KEY ("school_id","teacher_membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_school_classroom_year_fk" FOREIGN KEY ("school_id","classroom_id","academic_year_id") REFERENCES "public"."classrooms"("school_id","id","academic_year_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_school_shift_fk" FOREIGN KEY ("school_id","shift_id") REFERENCES "public"."school_shifts"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_school_period_shift_fk" FOREIGN KEY ("school_id","period_id","shift_id") REFERENCES "public"."school_shift_periods"("school_id","id","shift_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_school_subject_fk" FOREIGN KEY ("school_id","subject_id") REFERENCES "public"."subjects"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_school_primary_teacher_fk" FOREIGN KEY ("school_id","primary_teacher_membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_school_partner_teacher_fk" FOREIGN KEY ("school_id","partner_teacher_membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_school_homeroom_teacher_fk" FOREIGN KEY ("school_id","homeroom_teacher_membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_id_id_unique" UNIQUE("school_id","id");
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_entry_date_unique" UNIQUE("school_id","timetable_entry_id","business_date");
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_timetable_entry_fk" FOREIGN KEY ("school_id","timetable_entry_id") REFERENCES "public"."timetable_entries"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_subject_fk" FOREIGN KEY ("school_id","subject_id") REFERENCES "public"."subjects"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_teacher_membership_fk" FOREIGN KEY ("school_id","teacher_membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "school_shifts_school_status_order_idx" ON "school_shifts" USING btree ("school_id","status","sort_order");
--> statement-breakpoint
CREATE INDEX "school_shift_periods_school_shift_ordinal_idx" ON "school_shift_periods" USING btree ("school_id","shift_id","ordinal");
--> statement-breakpoint
CREATE INDEX "teacher_weekly_hour_requirements_school_year_idx" ON "teacher_weekly_hour_requirements" USING btree ("school_id","academic_year_id");
--> statement-breakpoint
CREATE INDEX "timetable_entries_school_teacher_idx" ON "timetable_entries" USING btree ("school_id","primary_teacher_membership_id","status");
--> statement-breakpoint
CREATE INDEX "timetable_entries_school_classroom_day_idx" ON "timetable_entries" USING btree ("school_id","classroom_id","day_of_week");
--> statement-breakpoint
CREATE INDEX "classrooms_school_homeroom_teacher_idx" ON "classrooms" USING btree ("school_id","homeroom_teacher_membership_id");
--> statement-breakpoint
CREATE INDEX "attendance_sessions_school_teacher_date_idx" ON "attendance_sessions" USING btree ("school_id","teacher_membership_id","business_date");
--> statement-breakpoint
CREATE INDEX "attendance_sessions_school_status_deadline_idx" ON "attendance_sessions" USING btree ("school_id","status","submission_deadline_at");
