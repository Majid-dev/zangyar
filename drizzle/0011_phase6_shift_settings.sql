-- Task 3: school-level shift settings, a single period list, and assignment-level
-- teaching hours.
--
-- This reshapes what Task 1 introduced, in three ways.
--
-- `school_shifts` is gone. Task 1 modelled a shift as a row so a school could run
-- several, but a period has no kind or label now, which means there is exactly one
-- period list per school and a single period list belongs to exactly one shift —
-- so a table of shifts would have held one row, or a set of rows sharing one period
-- list. The shift type and its rotation anchor move onto the school's settings row,
-- where the operating weekdays already live, because which days the school is open
-- is part of what "a morning school" means.
--
-- `school_shift_periods` becomes `school_periods`. The `kind`, `label`, and
-- `hour_count` columns are dropped: a period is a position in the day described by
-- its start and end time, breaks are not modelled at all, and a period's worth is
-- no longer a property of the period. `school_operating_days` loses its `shift_id`
-- for the same reason and is now keyed on `(school_id, day_of_week)`.
--
-- `timetable_entries` loses `shift_id` and gains `scope` and `hour_count`. The
-- hours move here because a period is naturally two hours and one teacher may take
-- both or a single one: a full assignment is two hours, and a period split between
-- two teachers is one hour each, taken on alternating weeks. That is the fact the
-- assigned-hours report sums, and it is why the duration cannot live on the period.
--
-- `attendance_sessions` gains `applicable_shift`. A rotating school's answer to
-- "which shift ran that morning" depends on the rotation anchor, so a past register
-- records its own answer rather than re-deriving one from settings that may since
-- have changed.
--
-- Existing attendance, timetable, and period rows are deleted rather than migrated:
-- the new columns are NOT NULL and carry meanings no existing row can supply — a
-- period had no scope, a session had no shift, an entry's hours were the period's.
-- The task that owns this migration treats current data as disposable; from here
-- the shape is what matters.

DELETE FROM "notification_logs";
--> statement-breakpoint
DELETE FROM "notification_outbox";
--> statement-breakpoint
DELETE FROM "attendance_records";
--> statement-breakpoint
DELETE FROM "attendance_sessions";
--> statement-breakpoint
DELETE FROM "timetable_entries";
--> statement-breakpoint
DELETE FROM "school_operating_days";
--> statement-breakpoint
CREATE TYPE "public"."applicable_shift" AS ENUM('MORNING', 'AFTERNOON');
--> statement-breakpoint
CREATE TYPE "public"."period_assignment_scope" AS ENUM('FULL', 'SINGLE_HOUR');
--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "shift_type" "school_shift_kind" DEFAULT 'MORNING' NOT NULL;
--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "rotation_base_date" date;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "applicable_shift" "applicable_shift" NOT NULL;
--> statement-breakpoint
-- The old period table is replaced wholesale rather than altered: every column it
-- kept has moved or been dropped, so recreating it is clearer than a rename plus
-- three drops, and nothing references it at this point.
CREATE TABLE "school_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_periods_school_ordinal_unique" UNIQUE("school_id","ordinal"),
	CONSTRAINT "school_periods_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "school_periods_time_order_check" CHECK ("school_periods"."start_time" < "school_periods"."end_time"),
	CONSTRAINT "school_periods_ordinal_check" CHECK ("school_periods"."ordinal" > 0)
);
--> statement-breakpoint
ALTER TABLE "school_periods" ADD CONSTRAINT "school_periods_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "school_periods_school_ordinal_idx" ON "school_periods" USING btree ("school_id","ordinal");
--> statement-breakpoint
ALTER TABLE "school_operating_days" DROP CONSTRAINT "school_operating_days_school_shift_fk";
--> statement-breakpoint
ALTER TABLE "school_operating_days" DROP CONSTRAINT "school_operating_days_school_id_shift_id_day_of_week_pk";
--> statement-breakpoint
ALTER TABLE "school_operating_days" DROP COLUMN "shift_id";
--> statement-breakpoint
ALTER TABLE "school_operating_days" ADD CONSTRAINT "school_operating_days_school_id_day_of_week_pk" PRIMARY KEY("school_id","day_of_week");
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP CONSTRAINT "timetable_entries_classroom_slot_unique";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP CONSTRAINT "timetable_entries_school_shift_fk";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP CONSTRAINT "timetable_entries_school_period_shift_fk";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP COLUMN "shift_id";
--> statement-breakpoint
-- Dropped only once nothing references them: `timetable_entries` pointed at both,
-- so the tables have to outlive the columns that depended on them.
DROP TABLE "school_shift_periods";
--> statement-breakpoint
DROP TABLE "school_shifts";
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD COLUMN "scope" "period_assignment_scope" DEFAULT 'FULL' NOT NULL;
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD COLUMN "hour_count" integer DEFAULT 2 NOT NULL;
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_classroom_slot_unique" UNIQUE("school_id","classroom_id","day_of_week","period_id");
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_school_period_fk" FOREIGN KEY ("school_id","period_id") REFERENCES "public"."school_periods"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_hours_check" CHECK ((
    ("timetable_entries"."scope" = 'FULL' and "timetable_entries"."hour_count" = 2)
    or ("timetable_entries"."scope" = 'SINGLE_HOUR' and "timetable_entries"."hour_count" = 1)
  ));
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_scope_rotation_check" CHECK ((
    ("timetable_entries"."scope" = 'SINGLE_HOUR' and "timetable_entries"."rotation" = 'WEEKLY_ALTERNATING')
    or "timetable_entries"."scope" = 'FULL'
  ));
--> statement-breakpoint
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_rotation_base_date_check" CHECK ((
    ("school_settings"."shift_type" = 'ROTATING' and "school_settings"."rotation_base_date" is not null)
    or ("school_settings"."shift_type" <> 'ROTATING' and "school_settings"."rotation_base_date" is null)
  ));
