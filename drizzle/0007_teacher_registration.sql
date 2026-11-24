-- Teacher registration: a School Admin authorizes a mobile number, the person
-- self-registers and is approved by the admin.
--
-- The three ALTER TYPE statements below add enum values that are NOT used by any
-- statement in this file. That matters: Postgres forbids using a value added by
-- ALTER TYPE ... ADD VALUE within the same transaction, and drizzle-kit applies
-- every pending migration inside one transaction on a fresh database. Adding the
-- values here and only referencing them from application code (which runs long
-- after the migration commits) keeps that rule satisfied.
ALTER TYPE "public"."membership_status" ADD VALUE 'PENDING_ADMIN_APPROVAL';--> statement-breakpoint
ALTER TYPE "public"."membership_status" ADD VALUE 'REJECTED';--> statement-breakpoint
ALTER TYPE "public"."otp_purpose" ADD VALUE 'TEACHER_REGISTRATION';--> statement-breakpoint
CREATE TYPE "public"."teacher_registration_status" AS ENUM('PENDING', 'CLAIMED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "teacher_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"personnel_code" varchar(50),
	"status" "teacher_registration_status" DEFAULT 'PENDING' NOT NULL,
	"membership_id" uuid,
	"claimed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teacher_registrations" ADD CONSTRAINT "teacher_registrations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_registrations" ADD CONSTRAINT "teacher_registrations_school_membership_fk" FOREIGN KEY ("school_id","membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_registrations" ADD CONSTRAINT "teacher_registrations_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_registrations_school_phone_unique" ON "teacher_registrations" USING btree ("school_id","phone_number") WHERE status <> 'REVOKED';--> statement-breakpoint
CREATE INDEX "teacher_registrations_school_status_idx" ON "teacher_registrations" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "teacher_registrations_phone_idx" ON "teacher_registrations" USING btree ("phone_number");--> statement-breakpoint
-- Invitations are replaced by the above. No table has a foreign key into
-- teacher_invitations, so the drop is dependency-clean; the type follows the
-- table because the table's column depends on it.
DROP TABLE "teacher_invitations";--> statement-breakpoint
DROP TYPE "public"."teacher_invitation_status";
