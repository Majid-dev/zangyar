CREATE TYPE "public"."student_status" AS ENUM('ACTIVE', 'WITHDRAWN', 'GRADUATED', 'ARCHIVED');--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "status" TYPE "public"."student_status" USING (
  CASE "status"::text
    WHEN 'ACTIVE' THEN 'ACTIVE'::"public"."student_status"
    WHEN 'ARCHIVED' THEN 'ARCHIVED'::"public"."student_status"
  END
);--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_no_student_year_overlap" EXCLUDE USING gist (
  "school_id" WITH =,
  "student_id" WITH =,
  "academic_year_id" WITH =,
  daterange("start_date", COALESCE("end_date", 'infinity'::date), '[)') WITH &&
);