-- Task 4: the timetable becomes one row per teaching hour, and the homeroom
-- teacher is dropped.
--
-- `timetable_entries` changes from one row per classroom slot to one row per
-- *hour* of that slot. Under the previous shape a period was one row carrying a
-- scope, a nullable partner teacher, and a rotation mode, which could express two
-- teachers sharing one subject on alternating weeks and nothing else. The task
-- asks for two single-hour assignments that may be two different teachers and two
-- different subjects, which that shape cannot hold: there is one `subject_id`
-- and it belongs to both teachers. Numbering the hours and giving each its own
-- row makes all three of the shapes the school actually uses fall out of the same
-- table — two rows with the same teacher and subject are a full lesson, one row is
-- a single hour, and two rows with different teachers or subjects are a split —
-- with nothing to keep consistent between them.
--
-- So `scope`, `hour_count`, `partner_teacher_membership_id`, `rotation`, and
-- `rotation_base_date` all go: the scope and hours were derived from the pairing,
-- the partner was a second teacher in a column, and the rotation only ever
-- described how that second teacher took their turn. `hour_index` replaces them as
-- the one fact the row needs to state. `primary_teacher_membership_id` loses its
-- "primary" because there is no longer a secondary: it is simply the teacher of
-- this hour.
--
-- `classrooms.homeroom_teacher_membership_id` is dropped. The class-definition
-- form no longer asks for a liable teacher, and keeping a column nothing writes
-- would leave a teacher's access to a roster resting on a value no interface can
-- set. Teacher access to a classroom now comes solely from holding a timetable
-- hour in it.
--
-- Existing timetable, attendance, and period-dependent rows are deleted rather
-- than migrated: a single entry cannot be split into the two hour rows the new
-- shape needs without inventing a second subject and teacher for a lesson that
-- never had one. The task that owns this migration treats current data as
-- disposable; from here the shape is what matters.

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
ALTER TABLE "classrooms" DROP CONSTRAINT "classrooms_school_homeroom_teacher_fk";
--> statement-breakpoint
ALTER TABLE "classrooms" DROP COLUMN "homeroom_teacher_membership_id";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP CONSTRAINT "timetable_entries_classroom_slot_unique";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP CONSTRAINT "timetable_entries_school_primary_teacher_fk";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP CONSTRAINT "timetable_entries_school_partner_teacher_fk";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP CONSTRAINT "timetable_entries_rotation_check";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP CONSTRAINT "timetable_entries_distinct_teachers_check";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP CONSTRAINT "timetable_entries_hours_check";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP CONSTRAINT "timetable_entries_scope_rotation_check";
--> statement-breakpoint
DROP INDEX "timetable_entries_school_teacher_idx";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP COLUMN "partner_teacher_membership_id";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP COLUMN "rotation";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP COLUMN "rotation_base_date";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP COLUMN "scope";
--> statement-breakpoint
ALTER TABLE "timetable_entries" DROP COLUMN "hour_count";
--> statement-breakpoint
ALTER TABLE "timetable_entries" RENAME COLUMN "primary_teacher_membership_id" TO "teacher_membership_id";
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD COLUMN "hour_index" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_classroom_hour_unique" UNIQUE("school_id","classroom_id","day_of_week","period_id","hour_index");
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_school_teacher_fk" FOREIGN KEY ("school_id","teacher_membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_hour_index_check" CHECK ("timetable_entries"."hour_index" between 1 and 2);
--> statement-breakpoint
CREATE INDEX "timetable_entries_school_teacher_idx" ON "timetable_entries" USING btree ("school_id","teacher_membership_id","status");
--> statement-breakpoint
-- Dropped only once no column references them, which the drops above arranged.
DROP TYPE "public"."period_assignment_scope";
--> statement-breakpoint
DROP TYPE "public"."timetable_rotation";
