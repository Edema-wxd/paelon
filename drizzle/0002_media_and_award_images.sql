-- Media table, and awards' images as foreign keys into it (spec §8 Content
-- editing: "Each upload is a row in a `media` table … content rows reference
-- it by foreign key. Alt text lives on the media row").
--
-- NOT YET REGISTERED IN drizzle/meta/_journal.json. `drizzle-kit generate` has
-- to be run once interactively to record the snapshot — it asks whether
-- `awards.logo` → `awards.logo_id` is a rename, and the answer is no: the type
-- changes from `text` (a CDN URL) to `uuid` (a media id), so the old column is
-- dropped and a new one created. Until that run, `npm run db:push` is what
-- syncs a database from lib/db/schema.ts, which is the documented local flow.
--
-- `awards` is the first table to migrate onto `media` because it is the only
-- image-bearing content table with no seed rows, so there is nothing to
-- backfill. The rest still hold CDN URLs in `text` columns.

CREATE TABLE IF NOT EXISTS "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"url" text NOT NULL,
	-- NOT NULL with no default: every write has to say something. The empty
	-- string is a valid answer and means "decorative on purpose".
	"alt" text NOT NULL,
	"filename" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk"
	FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id")
	ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "media_key_key" ON "media" USING btree ("key");
--> statement-breakpoint

-- The `updated_at` trigger every other table has (see 0001).
CREATE TRIGGER "media_set_updated_at"
	BEFORE UPDATE ON "media"
	FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Awards' images become media references. Dropped rather than converted:
-- these columns are empty (no seed file exists for awards), and a CDN URL
-- carries no alt text to convert anyway.
ALTER TABLE "awards" DROP COLUMN IF EXISTS "logo";
--> statement-breakpoint
ALTER TABLE "awards" DROP COLUMN IF EXISTS "certificate_image";
--> statement-breakpoint

ALTER TABLE "awards" ADD COLUMN "logo_id" uuid;
--> statement-breakpoint
ALTER TABLE "awards" ADD COLUMN "certificate_image_id" uuid;
--> statement-breakpoint

-- `restrict`, not `set null`: a media delete that silently blanks a published
-- award's logo is what lib/db/queries/media-references.ts exists to prevent,
-- so the database refuses it too.
ALTER TABLE "awards" ADD CONSTRAINT "awards_logo_id_media_id_fk"
	FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "awards" ADD CONSTRAINT "awards_certificate_image_id_media_id_fk"
	FOREIGN KEY ("certificate_image_id") REFERENCES "public"."media"("id")
	ON DELETE restrict ON UPDATE no action;
