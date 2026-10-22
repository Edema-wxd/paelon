-- About-page prose (Phase 2, 2026-10-22 — reverses the file-based arrangement
-- in spec §6 About and lib/validation/about.ts).
--
-- The page's six prose fields moved out of content/about.json and into a
-- singleton table so Paelon can write the founding story, mission, vision,
-- value proposition, motto and ESG block without a deploy. The shape is the
-- JSON file's, field for field, so lib/about.ts keeps its contract and no
-- template changes.
--
-- Legal pages deliberately did NOT move. Decision C3 stands: /privacy and
-- /terms change by PR after counsel review, with CONSENT_TEXT_VERSION bumped
-- in the same deploy, and git history is the record of which wording each
-- recorded consent refers to.
--
-- Singleton, like site_settings, and for the same reason: one page of prose
-- with no rows in it. A second row would be a second About page.
--
-- NOT YET REGISTERED IN drizzle/meta/_journal.json, as with 0002, 0003 and
-- 0004. The outstanding interactive `drizzle-kit generate` run covers them all.

CREATE TABLE IF NOT EXISTS "about_content" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	-- The page goes live by an explicit edit, never by omission. While this is
	-- false the route serves noindex: an About page of empty sections ranking
	-- for the hospital's name is worse than one that is not indexed.
	"published" boolean DEFAULT false NOT NULL,
	-- True while the prose is a draft nobody at Paelon has confirmed.
	-- Placeholder text is non-empty, so an "is it filled in" check cannot catch
	-- it on its own. Publishing is refused while this is true.
	"placeholder" boolean DEFAULT false NOT NULL,
	-- Markdown, rendered by lib/markdown.ts and ArticleBody like every other
	-- long text on the site. NULL means nobody has written it yet — never the
	-- words "TODO(seed)", which would reach a reader.
	"intro" text,
	"founding_story" text,
	"mission" text,
	"vision" text,
	"value_proposition" text,
	-- One line, shown as a pull quote. Not Markdown.
	"motto" text,
	-- Prose, not a boolean: "we are EDGE certified" is a verifiable claim about
	-- a real certificate, and a flag defaulting either way would assert one.
	"esg" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "about_content_singleton" CHECK ("id" = 1),
	CONSTRAINT "about_content_motto_length" CHECK ("motto" IS NULL OR length("motto") <= 200)
);
--> statement-breakpoint

-- set null, not cascade: deactivating the admin who last edited the page must
-- not delete the page.
ALTER TABLE "about_content" ADD CONSTRAINT "about_content_updated_by_user_id_users_id_fk"
	FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id")
	ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

-- The updated_at trigger every other table has. 0001's DO block iterates a
-- hardcoded table list, so a new table wires its own (as 0002 and 0003 did).
CREATE TRIGGER "about_content_set_updated_at"
	BEFORE UPDATE ON "about_content"
	FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- The row, carrying what content/about.json held: nothing. Every field in that
-- file was null and none of it may be drafted — the founding story is about
-- real people and the mission, vision and ESG claims are statements the
-- hospital makes about itself (CLAUDE.md). The screen edits this row; it is
-- never created through the panel, so every read may assume it exists.
INSERT INTO "about_content" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
