-- Blog authoring: every content image becomes a media reference, media gains
-- intrinsic dimensions, and blog_posts gains a full-text search vector.
--
-- Three things in one migration because they are one decision each, all
-- ratified on 2026-10-19, and splitting them would leave the schema in a state
-- no branch of the code expects.
--
-- ## Images (spec §8 Content editing)
--
-- `awards` migrated onto `media` in 0002; this finishes the job for the other
-- seven scalar columns and the two galleries. After this, every image on a
-- content row is a `media.id`, alt text lives on the media row, and
-- lib/db/queries/media-references.ts resolves them by join rather than by
-- substring — the move its FOREIGN_KEY_COLUMNS comment describes.
--
-- The old text columns are dropped, not converted. They did not hold what they
-- were documented to hold: the nine non-null values in the development database
-- were build-time pipeline paths (`/images/service-family-health.png`), which
-- are design assets delivered by scripts/optimize-images.mjs and rendered
-- through components/site/site-image.tsx against lib/image-manifest.json. They
-- are not UploadThing objects, so they have no `media` row to point at, and
-- nothing on the marketing site read these columns to begin with. Giving them
-- media rows would also list every design asset in the admin media library as
-- a deletable object, which is exactly what must not happen.
--
-- So the columns start empty and hold editorial uploads only. A template that
-- wants a CMS-managed image prefers the media reference and falls back to its
-- SiteImage slot; none do yet except the blog, which is why this migration
-- exists.
--
-- ## Galleries
--
-- Join tables rather than `uuid[]`, because Postgres cannot put a foreign key
-- on an array element and `restrict` on delete is the whole point. Same shape
-- as blog_post_related. Both arrays are empty in every database, so there is
-- nothing to carry across.
--
-- ## Search (blog only)
--
-- A generated, stored tsvector with a GIN index, weighted title > excerpt and
-- tags > body. `GENERATED ALWAYS` rather than a trigger: the column cannot
-- drift from the row, and every expression in it is immutable, which is what
-- Postgres requires of a generated column.

-- Intrinsic dimensions, captured at upload. next/image needs width and height
-- to reserve space, and CLS < 0.05 is a hard budget (spec §13). Nullable: the
-- rows that predate this cannot have them, and a body image whose dimensions
-- are unknown degrades to its alt text rather than shipping a layout shift.
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "width" integer;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "height" integer;
--> statement-breakpoint

-- Dimensions come in pairs or not at all. A width with no height reserves
-- nothing, so the check refuses the half-set rather than letting the renderer
-- guess.
ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_dimensions_paired";
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_dimensions_paired"
	CHECK (("width" IS NULL) = ("height" IS NULL));
--> statement-breakpoint

ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_dimensions_positive";
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_dimensions_positive"
	CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0));
--> statement-breakpoint

-- Scalar image columns become media references.
ALTER TABLE "services" DROP COLUMN IF EXISTS "featured_image";
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "featured_image_id" uuid;
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_featured_image_id_media_id_fk"
	FOREIGN KEY ("featured_image_id") REFERENCES "public"."media"("id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "doctors" DROP COLUMN IF EXISTS "headshot";
--> statement-breakpoint
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "headshot_id" uuid;
--> statement-breakpoint
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_headshot_id_media_id_fk"
	FOREIGN KEY ("headshot_id") REFERENCES "public"."media"("id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "locations" DROP COLUMN IF EXISTS "hero_image";
--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "hero_image_id" uuid;
--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_hero_image_id_media_id_fk"
	FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "hmos" DROP COLUMN IF EXISTS "logo";
--> statement-breakpoint
ALTER TABLE "hmos" ADD COLUMN IF NOT EXISTS "logo_id" uuid;
--> statement-breakpoint
ALTER TABLE "hmos" ADD CONSTRAINT "hmos_logo_id_media_id_fk"
	FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "testimonials" DROP COLUMN IF EXISTS "avatar";
--> statement-breakpoint
ALTER TABLE "testimonials" ADD COLUMN IF NOT EXISTS "avatar_id" uuid;
--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_avatar_id_media_id_fk"
	FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "authors" DROP COLUMN IF EXISTS "headshot";
--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN IF NOT EXISTS "headshot_id" uuid;
--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_headshot_id_media_id_fk"
	FOREIGN KEY ("headshot_id") REFERENCES "public"."media"("id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "blog_posts" DROP COLUMN IF EXISTS "hero_image";
--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "hero_image_id" uuid;
--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_hero_image_id_media_id_fk"
	FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

-- Galleries. `order` carries the editor's sequence; the primary key stops the
-- same asset being added to one gallery twice.
ALTER TABLE "services" DROP COLUMN IF EXISTS "gallery_images";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_gallery_images" (
	"service_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "service_gallery_images_service_id_media_id_pk"
		PRIMARY KEY ("service_id", "media_id")
);
--> statement-breakpoint
ALTER TABLE "service_gallery_images" ADD CONSTRAINT "service_gallery_images_service_id_services_id_fk"
	FOREIGN KEY ("service_id") REFERENCES "public"."services"("id")
	ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_gallery_images" ADD CONSTRAINT "service_gallery_images_media_id_media_id_fk"
	FOREIGN KEY ("media_id") REFERENCES "public"."media"("id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_gallery_images_service_id_order_idx"
	ON "service_gallery_images" USING btree ("service_id", "order");
--> statement-breakpoint

ALTER TABLE "locations" DROP COLUMN IF EXISTS "gallery_images";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "location_gallery_images" (
	"location_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "location_gallery_images_location_id_media_id_pk"
		PRIMARY KEY ("location_id", "media_id")
);
--> statement-breakpoint
ALTER TABLE "location_gallery_images" ADD CONSTRAINT "location_gallery_images_location_id_locations_id_fk"
	FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
	ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_gallery_images" ADD CONSTRAINT "location_gallery_images_media_id_media_id_fk"
	FOREIGN KEY ("media_id") REFERENCES "public"."media"("id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_gallery_images_location_id_order_idx"
	ON "location_gallery_images" USING btree ("location_id", "order");
--> statement-breakpoint

-- Full-text search over the blog.
--
-- Weights: a term in the title ranks above one in the excerpt, which ranks
-- above one in the body. 'english' is a literal rather than the
-- `default_text_search_config` setting, because the configuration name is what
-- makes to_tsvector immutable and therefore usable in a generated column.
--
-- Tags are deliberately NOT in the vector. Folding them in needs the array as
-- text, and both ways of getting there — array_to_string() and a ::text cast
-- through array_out() — are STABLE, not IMMUTABLE, which Postgres refuses in a
-- generated column. `array_to_tsvector()` is immutable but neither lowercases
-- nor stems, so a tag typed "Malaria" would never match a search for
-- "malaria", and lowercasing the stored tags is not an option: the same
-- tagsField feeds doctors' specialties and service tags, which the marketing
-- site renders as typed. So tags are matched in the query instead, next to the
-- exact `?tag=` filter that lib/db/queries/blog.ts needs regardless.
--
-- The body is indexed as its Markdown source. The subset lib/markdown.ts
-- accepts has no block syntax that survives into a word — `**bold**` tokenises
-- as `bold` — so stripping it first would buy nothing and would have to be
-- done in an immutable function to be allowed here at all.
ALTER TABLE "blog_posts" DROP COLUMN IF EXISTS "search_vector";
--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "search_vector" tsvector
	GENERATED ALWAYS AS (
		setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
		setweight(to_tsvector('english', coalesce("excerpt", '')), 'B') ||
		setweight(to_tsvector('english', coalesce("body", '')), 'C')
	) STORED;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "blog_posts_search_vector_idx"
	ON "blog_posts" USING gin ("search_vector");
