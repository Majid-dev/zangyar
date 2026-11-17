CREATE TYPE "public"."academic_year_status" AS ENUM('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."attendance_session_kind" AS ENUM('DAILY', 'LESSON');--> statement-breakpoint
CREATE TYPE "public"."attendance_session_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('SCHOOL_ADMIN', 'TEACHER');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('ACTIVE', 'SUSPENDED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."notification_attempt_status" AS ENUM('SENT', 'FAILED', 'RETRYABLE', 'PERMANENT');--> statement-breakpoint
CREATE TYPE "public"."notification_event_type" AS ENUM('ATTENDANCE', 'ACTIVITY');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."school_status" AS ENUM('ACTIVE', 'SUSPENDED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(120) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "academic_year_status" DEFAULT 'DRAFT' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_years_school_code_unique" UNIQUE("school_id","code"),
	CONSTRAINT "academic_years_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "academic_years_date_order_check" CHECK ("academic_years"."start_date" < "academic_years"."end_date")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provider_account_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "activity_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"class_activity_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"classroom_id" uuid NOT NULL,
	"outcome" varchar(64) NOT NULL,
	"note" text,
	"recorded_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_records_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "activity_records_activity_enrollment_unique" UNIQUE("school_id","class_activity_id","enrollment_id")
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"attendance_session_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"classroom_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"note" text,
	"recorded_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_records_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "attendance_records_session_enrollment_unique" UNIQUE("school_id","attendance_session_id","enrollment_id")
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"classroom_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"session_kind" "attendance_session_kind" DEFAULT 'DAILY' NOT NULL,
	"status" "attendance_session_status" DEFAULT 'OPEN' NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_sessions_school_id_classroom_unique" UNIQUE("school_id","id","classroom_id"),
	CONSTRAINT "attendance_sessions_school_classroom_date_kind_unique" UNIQUE("school_id","classroom_id","business_date","session_kind")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid,
	"actor_user_id" text NOT NULL,
	"actor_membership_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"classroom_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"activity_date" date NOT NULL,
	"category" varchar(64) NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"created_by_membership_id" uuid NOT NULL,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_activities_school_id_classroom_unique" UNIQUE("school_id","id","classroom_id")
);
--> statement-breakpoint
CREATE TABLE "class_teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"classroom_id" uuid NOT NULL,
	"teacher_membership_id" uuid NOT NULL,
	"subject_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_teachers_assignment_unique" UNIQUE("school_id","classroom_id","teacher_membership_id","subject_id"),
	CONSTRAINT "class_teachers_date_order_check" CHECK ("class_teachers"."end_date" is null or "class_teachers"."start_date" < "class_teachers"."end_date")
);
--> statement-breakpoint
CREATE TABLE "classrooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"grade_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(120) NOT NULL,
	"capacity" integer,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classrooms_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "classrooms_school_year_code_unique" UNIQUE("school_id","academic_year_id","code"),
	CONSTRAINT "classrooms_school_id_year_unique" UNIQUE("school_id","id","academic_year_id"),
	CONSTRAINT "classrooms_school_id_grade_unique" UNIQUE("school_id","id","grade_id"),
	CONSTRAINT "classrooms_capacity_check" CHECK ("classrooms"."capacity" is null or "classrooms"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"classroom_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_school_id_classroom_unique" UNIQUE("school_id","id","classroom_id"),
	CONSTRAINT "enrollments_date_order_check" CHECK ("enrollments"."end_date" is null or "enrollments"."start_date" < "enrollments"."end_date")
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(120) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grades_school_code_unique" UNIQUE("school_id","code"),
	CONSTRAINT "grades_school_id_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"normalized_mobile" varchar(20),
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_school_id_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"notification_outbox_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_message_id" varchar(255),
	"status" "notification_attempt_status" NOT NULL,
	"response" jsonb,
	"error_category" varchar(64),
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_logs_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"event_type" "notification_event_type" NOT NULL,
	"attendance_record_id" uuid,
	"activity_record_id" uuid,
	"guardian_id" uuid NOT NULL,
	"recipient_mobile" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"policy_decision" boolean NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "notification_outbox_school_idempotency_unique" UNIQUE("school_id","idempotency_key"),
	CONSTRAINT "notification_outbox_source_check" CHECK ((
    ("notification_outbox"."event_type" = 'ATTENDANCE' and "notification_outbox"."attendance_record_id" is not null and "notification_outbox"."activity_record_id" is null)
    or ("notification_outbox"."event_type" = 'ACTIVITY' and "notification_outbox"."activity_record_id" is not null and "notification_outbox"."attendance_record_id" is null)
  )),
	CONSTRAINT "notification_outbox_attempt_count_check" CHECK ("notification_outbox"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"user_id" text PRIMARY KEY NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "school_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"suspended_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_memberships_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "school_memberships_school_user_unique" UNIQUE("school_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "school_settings" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"notify_on_present" boolean DEFAULT false NOT NULL,
	"notify_on_absent" boolean DEFAULT false NOT NULL,
	"notify_on_late" boolean DEFAULT false NOT NULL,
	"notify_on_excused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" "school_status" DEFAULT 'ACTIVE' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Tehran' NOT NULL,
	"phone" varchar(32),
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schools_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relationship_type" varchar(64),
	"is_primary" boolean DEFAULT false NOT NULL,
	"receives_sms" boolean DEFAULT false NOT NULL,
	"is_emergency" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_guardians_school_id_student_id_guardian_id_pk" PRIMARY KEY("school_id","student_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"admission_number" varchar(64) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"national_id" varchar(32),
	"birth_date" date,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_school_admission_unique" UNIQUE("school_id","admission_number"),
	CONSTRAINT "students_school_id_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(120) NOT NULL,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_school_code_unique" UNIQUE("school_id","code"),
	CONSTRAINT "subjects_school_id_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_school_activity_classroom_fk" FOREIGN KEY ("school_id","class_activity_id","classroom_id") REFERENCES "public"."class_activities"("school_id","id","classroom_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_school_enrollment_classroom_fk" FOREIGN KEY ("school_id","enrollment_id","classroom_id") REFERENCES "public"."enrollments"("school_id","id","classroom_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_school_recorder_membership_fk" FOREIGN KEY ("school_id","recorded_by_membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_session_classroom_fk" FOREIGN KEY ("school_id","attendance_session_id","classroom_id") REFERENCES "public"."attendance_sessions"("school_id","id","classroom_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_enrollment_classroom_fk" FOREIGN KEY ("school_id","enrollment_id","classroom_id") REFERENCES "public"."enrollments"("school_id","id","classroom_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_recorder_membership_fk" FOREIGN KEY ("school_id","recorded_by_membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_classroom_year_fk" FOREIGN KEY ("school_id","classroom_id","academic_year_id") REFERENCES "public"."classrooms"("school_id","id","academic_year_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_creator_membership_fk" FOREIGN KEY ("school_id","created_by_membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_school_membership_fk" FOREIGN KEY ("school_id","actor_membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_school_classroom_year_fk" FOREIGN KEY ("school_id","classroom_id","academic_year_id") REFERENCES "public"."classrooms"("school_id","id","academic_year_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_school_creator_membership_fk" FOREIGN KEY ("school_id","created_by_membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_school_classroom_fk" FOREIGN KEY ("school_id","classroom_id") REFERENCES "public"."classrooms"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_school_membership_fk" FOREIGN KEY ("school_id","teacher_membership_id") REFERENCES "public"."school_memberships"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_school_subject_fk" FOREIGN KEY ("school_id","subject_id") REFERENCES "public"."subjects"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_school_academic_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_school_grade_fk" FOREIGN KEY ("school_id","grade_id") REFERENCES "public"."grades"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."students"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_academic_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_classroom_year_fk" FOREIGN KEY ("school_id","classroom_id","academic_year_id") REFERENCES "public"."classrooms"("school_id","id","academic_year_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_school_outbox_fk" FOREIGN KEY ("school_id","notification_outbox_id") REFERENCES "public"."notification_outbox"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_school_attendance_record_fk" FOREIGN KEY ("school_id","attendance_record_id") REFERENCES "public"."attendance_records"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_school_activity_record_fk" FOREIGN KEY ("school_id","activity_record_id") REFERENCES "public"."activity_records"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_school_guardian_fk" FOREIGN KEY ("school_id","guardian_id") REFERENCES "public"."guardians"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."students"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_guardian_fk" FOREIGN KEY ("school_id","guardian_id") REFERENCES "public"."guardians"("school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_years_one_active_per_school_idx" ON "academic_years" USING btree ("school_id") WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "academic_years_school_status_idx" ON "academic_years" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_records_school_activity_idx" ON "activity_records" USING btree ("school_id","class_activity_id");--> statement-breakpoint
CREATE INDEX "activity_records_school_enrollment_idx" ON "activity_records" USING btree ("school_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "attendance_records_school_session_idx" ON "attendance_records" USING btree ("school_id","attendance_session_id");--> statement-breakpoint
CREATE INDEX "attendance_records_school_enrollment_idx" ON "attendance_records" USING btree ("school_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "attendance_sessions_school_classroom_date_idx" ON "attendance_sessions" USING btree ("school_id","classroom_id","business_date");--> statement-breakpoint
CREATE INDEX "audit_logs_school_occurred_idx" ON "audit_logs" USING btree ("school_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_occurred_idx" ON "audit_logs" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "class_activities_school_classroom_date_idx" ON "class_activities" USING btree ("school_id","classroom_id","activity_date");--> statement-breakpoint
CREATE UNIQUE INDEX "class_teachers_one_primary_idx" ON "class_teachers" USING btree ("school_id","classroom_id") WHERE is_primary = true and status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "class_teachers_school_teacher_idx" ON "class_teachers" USING btree ("school_id","teacher_membership_id","status");--> statement-breakpoint
CREATE INDEX "class_teachers_school_classroom_idx" ON "class_teachers" USING btree ("school_id","classroom_id","status");--> statement-breakpoint
CREATE INDEX "classrooms_school_year_grade_idx" ON "classrooms" USING btree ("school_id","academic_year_id","grade_id");--> statement-breakpoint
CREATE INDEX "enrollments_school_year_classroom_idx" ON "enrollments" USING btree ("school_id","academic_year_id","classroom_id");--> statement-breakpoint
CREATE INDEX "enrollments_school_student_year_idx" ON "enrollments" USING btree ("school_id","student_id","academic_year_id","start_date");--> statement-breakpoint
CREATE INDEX "grades_school_status_order_idx" ON "grades" USING btree ("school_id","status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_school_mobile_unique" ON "guardians" USING btree ("school_id","normalized_mobile") WHERE normalized_mobile is not null;--> statement-breakpoint
CREATE INDEX "guardians_school_status_name_idx" ON "guardians" USING btree ("school_id","status","last_name","first_name");--> statement-breakpoint
CREATE INDEX "notification_logs_school_outbox_idx" ON "notification_logs" USING btree ("school_id","notification_outbox_id");--> statement-breakpoint
CREATE INDEX "notification_outbox_pending_idx" ON "notification_outbox" USING btree ("school_id","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_created_idx" ON "notification_outbox" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE INDEX "school_memberships_school_role_status_idx" ON "school_memberships" USING btree ("school_id","role","status");--> statement-breakpoint
CREATE INDEX "school_memberships_user_status_idx" ON "school_memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_guardians_one_primary_idx" ON "student_guardians" USING btree ("school_id","student_id") WHERE is_primary = true;--> statement-breakpoint
CREATE INDEX "student_guardians_school_guardian_idx" ON "student_guardians" USING btree ("school_id","guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_school_national_id_unique" ON "students" USING btree ("school_id","national_id") WHERE national_id is not null;--> statement-breakpoint
CREATE INDEX "students_school_status_name_idx" ON "students" USING btree ("school_id","status","last_name","first_name");--> statement-breakpoint
CREATE INDEX "subjects_school_status_idx" ON "subjects" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at");