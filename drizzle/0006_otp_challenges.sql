CREATE TYPE "public"."otp_challenge_status" AS ENUM('PENDING', 'CONSUMED', 'REVOKED', 'EXHAUSTED');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('TEACHER_ACTIVATION', 'LOGIN', 'PASSWORD_RESET');--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"code_hash" char(64) NOT NULL,
	"status" "otp_challenge_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"provider" varchar(64) NOT NULL,
	"school_id" uuid,
	"membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_challenges_attempts_check" CHECK ("attempt_count" >= 0 and "attempt_count" <= "max_attempts")
);
--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_school_membership_fk" FOREIGN KEY ("school_id","membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "otp_challenges_one_pending_idx" ON "otp_challenges" USING btree ("purpose","phone_number") WHERE status = 'PENDING';--> statement-breakpoint
CREATE INDEX "otp_challenges_purpose_phone_created_idx" ON "otp_challenges" USING btree ("purpose","phone_number","created_at");--> statement-breakpoint
CREATE INDEX "otp_challenges_expires_idx" ON "otp_challenges" USING btree ("expires_at");
