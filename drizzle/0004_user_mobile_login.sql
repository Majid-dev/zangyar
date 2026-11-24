ALTER TABLE "user" ADD COLUMN "phone_number" varchar(20);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_number_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_phone_number_unique" UNIQUE("phone_number");--> statement-breakpoint
CREATE INDEX "enrollments_school_student_effective_idx" ON "enrollments" USING btree ("school_id","student_id","start_date","end_date");
