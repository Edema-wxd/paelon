-- Scheduled blog posts (2026-11-02, approved by Francis the same day).
--
-- A post gets a third state between draft and published: written, checked
-- against the publish rules, and waiting for its publication date. The job at
-- /api/jobs/publish-scheduled runs at 08:00 WAT and publishes every scheduled
-- post whose date has arrived (today or earlier, so a missed run catches up).
--
-- `scheduled` rather than inferring the state from a future `published_at`:
-- a draft with a date must stay a draft until someone decides otherwise.
--
-- The CHECK keeps the state honest at the database: a scheduled post is not
-- also published, and it has a date for the job to read.
--
-- Additive and safe to re-run: the column is added only if missing, defaults
-- to false for every existing row, and the constraint is added once.
--
-- Apply BEFORE deploying the code that reads it — every blog query selects the
-- column, so a deploy without it takes /blog down.
--
--   npm run db:apply -- drizzle/0010_blog_scheduling.sql
--
-- NOT YET REGISTERED IN drizzle/meta/_journal.json, as with 0002–0009
-- (CLAUDE.md, "Live gaps").

ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "scheduled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_scheduled_state"
		CHECK (NOT "scheduled" OR (NOT "published" AND "published_at" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
