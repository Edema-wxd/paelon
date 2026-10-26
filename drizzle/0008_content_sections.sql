-- Rearrangeable page sections for service pages and the About page
-- (2026-10-26, Francis: "structure the pages properly" — add, remove and
-- reorder blocks; convert the existing text into blocks).
--
-- One table for both page types. A service's sections reference the service
-- with a real foreign key (cascade on a hard delete, like every other child
-- table); the About page is a singleton, so its sections have no parent row.
-- The CHECK keeps the two cases honest: service sections always have a
-- service, About sections never do.
--
-- `data` is the block's content as JSON, validated per `kind` by Zod in
-- lib/validation/sections.ts on every write — the database stores, the schema
-- decides what is valid, as for the rest of the content model.
--
-- The existing prose is copied into Text sections in today's order and under
-- today's headings, so every page renders exactly as before on the first
-- request. The source columns are NOT dropped or cleared: they stay as the
-- fallback the templates use for a page with no sections, until Francis
-- confirms the sections are right. Each copy is guarded so re-running this
-- file never duplicates a page's sections.
--
-- `services.long_description` and `what_to_expect` lose NOT NULL: the service
-- editor no longer edits them (sections do), so a new service must be
-- creatable without them. Relaxing a constraint changes no existing row.
--
-- Safe to re-run. NOT YET REGISTERED IN drizzle/meta/_journal.json, as with
-- 0002–0007 (CLAUDE.md, "Live gaps").

DO $$ BEGIN
	CREATE TYPE "content_section_page" AS ENUM ('service', 'about');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	CREATE TYPE "content_section_kind" AS ENUM ('text', 'image', 'gallery', 'cta');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "content_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"page" "content_section_page" NOT NULL,
	"service_id" uuid,
	"kind" "content_section_kind" NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "content_sections_page_target" CHECK (("page" = 'service') = ("service_id" IS NOT NULL))
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "content_sections" ADD CONSTRAINT "content_sections_service_id_services_id_fk"
		FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Every read is "this page's sections, in order".
CREATE INDEX IF NOT EXISTS "content_sections_page_idx"
	ON "content_sections" USING btree ("page", "service_id", "order");
--> statement-breakpoint

-- `updated_at`, maintained like every other content table (migration 0001).
DO $$ BEGIN
	CREATE TRIGGER "content_sections_set_updated_at" BEFORE UPDATE ON "content_sections"
		FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

ALTER TABLE "services" ALTER COLUMN "long_description" DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE "services" ALTER COLUMN "what_to_expect" DROP NOT NULL;
--> statement-breakpoint

-- Services: the long description first, with no heading of its own (it sits
-- directly under the page h1), then "What to expect" under that heading —
-- today's layout. Only for services with no sections yet.
INSERT INTO "content_sections" ("page", "service_id", "kind", "order", "data")
SELECT 'service', src."service_id", 'text', src."order", src."data"
FROM (
	SELECT s."id" AS "service_id", 0 AS "order",
		jsonb_build_object('body', s."long_description") AS "data"
	FROM "services" s
	WHERE s."long_description" IS NOT NULL AND btrim(s."long_description") <> ''
	UNION ALL
	SELECT s."id", 1,
		jsonb_build_object('heading', 'What to expect', 'body', s."what_to_expect")
	FROM "services" s
	WHERE s."what_to_expect" IS NOT NULL AND btrim(s."what_to_expect") <> ''
) AS src
WHERE NOT EXISTS (
	SELECT 1 FROM "content_sections" c WHERE c."service_id" = src."service_id"
);
--> statement-breakpoint

-- About: the five prose sections under the headings the page uses today. The
-- intro stays a field — it is the lead under the h1, not a section.
INSERT INTO "content_sections" ("page", "kind", "order", "data")
SELECT 'about', 'text', src."order", jsonb_build_object('heading', src."heading", 'body', src."body")
FROM (
	SELECT 0 AS "order", 'Our story' AS "heading", a."founding_story" AS "body" FROM "about_content" a
	UNION ALL SELECT 1, 'Our mission', a."mission" FROM "about_content" a
	UNION ALL SELECT 2, 'Our vision', a."vision" FROM "about_content" a
	UNION ALL SELECT 3, 'What we offer', a."value_proposition" FROM "about_content" a
	UNION ALL SELECT 4, 'Sustainability and certification', a."esg" FROM "about_content" a
) AS src
WHERE src."body" IS NOT NULL AND btrim(src."body") <> ''
	AND NOT EXISTS (SELECT 1 FROM "content_sections" c WHERE c."page" = 'about');
