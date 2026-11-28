-- Task 7: record when a School Admin has modified an attendance record.
--
-- A correction was already audited — `audit_logs` keeps who changed what, from
-- which status to which — but nothing on the record itself said it had been
-- touched. A teacher opening a register they had submitted therefore saw their own
-- submission presented as though it were untouched, with no way to tell that the
-- school had since changed a status: the audit trail answers the question for
-- someone who goes looking, and the register is where the question is actually
-- asked.
--
-- `attendance_records` gains a nullable pair, `admin_edited_at` and
-- `admin_edited_by_membership_id`, set the first time a School Admin changes an
-- already-recorded status. Both are null for a record no administrator has
-- modified, so the columns are additive and no existing row is touched: a register
-- taken before this migration simply carries no admin edit, which is true of it.
--
-- The pair is never cleared once set. "Was this ever changed by the office" stays
-- true however many further edits follow, which is what the indicator on the
-- register is for; the ordered history lives in `audit_logs`, where every change
-- is already written.
--
-- `recorded_by_membership_id` keeps its meaning — who took the register — and is
-- deliberately not overwritten by a correction. An admin editing a teacher's
-- submission must not erase the fact that the teacher submitted it.

ALTER TABLE "attendance_records" ADD COLUMN "admin_edited_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "admin_edited_by_membership_id" uuid;
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_admin_edit_pair_check" CHECK ((
    ("attendance_records"."admin_edited_at" is null and "attendance_records"."admin_edited_by_membership_id" is null)
    or ("attendance_records"."admin_edited_at" is not null and "attendance_records"."admin_edited_by_membership_id" is not null)
  ));
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_admin_editor_membership_fk" FOREIGN KEY ("school_id","admin_edited_by_membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;
