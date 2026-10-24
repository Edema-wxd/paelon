-- The unique slug index `faqs` and `awards` never had (2026-10-24).
--
-- Every other content table carries `<table>_slug_key`, and lib/db/seed.ts
-- upserts with `ON CONFLICT ("slug")` on all of them. Without the index
-- Postgres has no unique constraint to infer, so seeding either table failed
-- outright — found when the first real FAQ content was seeded. The seed files
-- for both were absent until today, which is why nothing caught it sooner.
--
-- Additive and non-destructive: if either table already held duplicate slugs
-- the CREATE would fail rather than delete anything, and both are empty.
--
-- NOT YET REGISTERED IN drizzle/meta/_journal.json, as with 0002–0005.

CREATE UNIQUE INDEX IF NOT EXISTS "faqs_slug_key" ON "faqs" USING btree ("slug");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "awards_slug_key" ON "awards" USING btree ("slug");
