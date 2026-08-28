-- Hand-written migration: everything drizzle-kit cannot generate from the
-- schema definition (backend spec §22).

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
-- Maintained in Postgres rather than in application code so that admin writes,
-- the seed loader, and any manual SQL all stay correct without remembering to
-- set the column.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'services', 'doctors', 'locations', 'hmos', 'testimonials', 'authors',
    'blog_posts', 'awards', 'faqs', 'bookings', 'corporate_enquiries', 'users'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- NDPR consent, enforced at the database
-- ---------------------------------------------------------------------------
-- Master spec §14 says booking consent "must be true". Zod enforces it at the
-- boundary; this makes it impossible to write a non-consenting booking by any
-- path, including manual SQL.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_consent_ndpr_true" CHECK ("consent_ndpr" = true);
--> statement-breakpoint

ALTER TABLE "contact_submissions"
  ADD CONSTRAINT "contact_submissions_consent_ndpr_true" CHECK ("consent_ndpr" = true);
--> statement-breakpoint

ALTER TABLE "corporate_enquiries"
  ADD CONSTRAINT "corporate_enquiries_consent_ndpr_true" CHECK ("consent_ndpr" = true);
--> statement-breakpoint

ALTER TABLE "newsletter_subscribers"
  ADD CONSTRAINT "newsletter_subscribers_consent_ndpr_true" CHECK ("consent_ndpr" = true);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Booking reference sequence
-- ---------------------------------------------------------------------------
-- A single non-resetting sequence (Francis's decision). References read
-- PMH-<year>-<zero-padded sequence value>, where the sequence is global rather
-- than per-year: race-free under concurrency, and no annual migration.
--
-- SELECT COUNT(*)+1 is a race and would produce duplicate references under
-- concurrent submissions; `reference` also carries a UNIQUE constraint and the
-- insert retries once on conflict.
CREATE SEQUENCE IF NOT EXISTS booking_reference_seq AS bigint START 1 INCREMENT 1;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- HMO typeahead
-- ---------------------------------------------------------------------------
-- Trigram indexes for GET /api/hmo/search. `aliases` is matched by unnesting
-- into a text blob so that "AXA" finds "AXA Mansard Health Ltd".
CREATE INDEX IF NOT EXISTS "hmos_name_trgm_idx"
  ON "hmos" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint

-- `array_to_string` is STABLE, not IMMUTABLE (its behaviour depends on type
-- output functions), so Postgres refuses it in an index expression. This
-- wrapper is genuinely immutable for text[] and is the standard way round it.
CREATE OR REPLACE FUNCTION hmo_aliases_text(text[])
RETURNS text AS $$
  SELECT array_to_string($1, ' ');
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "hmos_aliases_trgm_idx"
  ON "hmos" USING gin (hmo_aliases_text("aliases") gin_trgm_ops);
