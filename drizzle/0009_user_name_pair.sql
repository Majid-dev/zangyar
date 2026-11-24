-- Store the account's own name as two fields instead of re-deriving them.
--
-- `user.name` is the single display name Better Auth requires, and it stays the
-- source for that. But the account settings page edits a first and a last name,
-- and without a stored pair it had to guess: it split `name` on the first space,
-- so "محمد رحیم رستمی" loaded as "محمد" + "رحیم رستمی". Rejoining those cannot
-- recover the original, which is why saving an untouched form reordered the name.
--
-- A teacher never had this problem because `teacher_profiles` already carries a
-- real pair (ADR-022); this applies the same idea to the global account, so every
-- role has a pair to load rather than a guess.
--
-- Both columns are nullable, and existing rows are left null rather than filled by
-- splitting `name`. A null pair means "not known yet" and the account surface falls
-- back to showing the whole name as one value — lossless, because saving it
-- unchanged rejoins to exactly the same string. Splitting here instead would bake
-- one interpretation of every existing multi-word name into the database for good,
-- which is the very guess this migration exists to remove.
ALTER TABLE "user" ADD COLUMN "first_name" varchar(100);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_name" varchar(100);
