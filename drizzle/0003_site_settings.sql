-- Site settings (Phase 2, decision C2 option B — reopened 2026-10-06).
--
-- A single row of non-secret display values Paelon must change without a
-- deploy. Secrets, integration toggles and the emergency line stay in env:
-- see lib/env.ts and lib/emergency.ts. Widening this table is a migration on
-- purpose — C2 rejected runtime feature flags (option C), and a key/value
-- store would accept them silently.
--
-- NOT YET REGISTERED IN drizzle/meta/_journal.json, as with 0002. The
-- outstanding interactive `drizzle-kit generate` run now covers both.

CREATE TABLE IF NOT EXISTS "site_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	-- Nullable: null is "Francis has not confirmed the number", and
	-- lib/response-time.ts keeps its TODO(seed) fallback until he does.
	-- Stored as hours, not prose, so the promise is worded in exactly one
	-- place (CLAUDE.md conversion baseline item 4).
	"response_time_hours" integer,
	-- Site-wide fallback behind locations.whatsapp. Stored E.164; the display
	-- form is derived. lib/validation/settings.ts normalises on the way in.
	"whatsapp_number" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "site_settings_singleton" CHECK ("id" = 1),
	CONSTRAINT "site_settings_response_time_hours_positive"
		CHECK ("response_time_hours" IS NULL OR "response_time_hours" > 0)
);
--> statement-breakpoint

-- set null, not cascade: deactivating the admin who last edited settings must
-- not delete the settings.
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_user_id_users_id_fk"
	FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id")
	ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

-- The updated_at trigger every other table has. 0001's DO block iterates a
-- hardcoded table list, so a new table wires its own (as 0002 did for media).
CREATE TRIGGER "site_settings_set_updated_at"
	BEFORE UPDATE ON "site_settings"
	FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- The row. The screen edits it; it is never created through the panel, so
-- every read can assume it exists.
INSERT INTO "site_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
