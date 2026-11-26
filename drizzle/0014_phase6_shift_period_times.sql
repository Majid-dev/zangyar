-- Task 7: a period carries both shifts' times, so a rotating school can run a
-- different daily schedule in the morning and the afternoon.
--
-- A rotating school alternates between two shifts week by week, and the two shifts
-- do not necessarily begin and end at the same clock times. `school_periods` held
-- one pair of times, which could describe only one of them. It gains
-- `afternoon_start_time` and `afternoon_end_time` alongside the existing pair: the
-- opening shift keeps `start_time`/`end_time`, so a fixed school — and every row
-- that already exists — is unchanged, and the new pair is null for it.
--
-- The new columns are nullable, so this migration adds them without touching any
-- existing row. Existing periods do not gain an afternoon schedule, because there
-- is no fact to invent one from: a school that rotates must enter it, and until it
-- does, that school's afternoon weeks fall back to the morning times rather than
-- to a schedule nobody stated. That fallback is in the pure resolver, not here.

ALTER TABLE "school_periods" ADD COLUMN "afternoon_start_time" time;
--> statement-breakpoint
ALTER TABLE "school_periods" ADD COLUMN "afternoon_end_time" time;
--> statement-breakpoint
ALTER TABLE "school_periods" ADD CONSTRAINT "school_periods_afternoon_times_check" CHECK ((
    ("school_periods"."afternoon_start_time" is null and "school_periods"."afternoon_end_time" is null)
    or ("school_periods"."afternoon_start_time" is not null and "school_periods"."afternoon_end_time" is not null and "school_periods"."afternoon_start_time" < "school_periods"."afternoon_end_time")
  ));
