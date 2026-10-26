-- FAQs assigned to individual services (2026-10-26).
--
-- Until now every service page showed the same FAQs — all of category
-- "services" — because FAQs were categorised, not attached. Francis asked for
-- FAQs to be assignable to particular services, shown only on those pages.
-- A join table, as for every other relation here (`service_locations`,
-- `service_related`): Postgres arrays cannot carry foreign keys.
--
-- Additive and non-destructive: one new table, one index, nothing altered or
-- dropped. Both foreign keys cascade, so deleting a service or an FAQ removes
-- its assignments rather than leaving rows pointing at nothing — the same rule
-- the other join tables follow. Content deletes are soft (`deleted_at`), so in
-- practice a cascade only runs on a hard delete.
--
-- Safe to re-run: every statement is IF NOT EXISTS or guarded.
--
-- NOT YET REGISTERED IN drizzle/meta/_journal.json, as with 0002–0006: write
-- the next migration by hand too (CLAUDE.md, "Live gaps").

CREATE TABLE IF NOT EXISTS "faq_services" (
	"faq_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	CONSTRAINT "faq_services_faq_id_service_id_pk" PRIMARY KEY("faq_id","service_id")
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "faq_services" ADD CONSTRAINT "faq_services_faq_id_faqs_id_fk"
		FOREIGN KEY ("faq_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "faq_services" ADD CONSTRAINT "faq_services_service_id_services_id_fk"
		FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- A service page asks "which FAQs are assigned to me?"; the primary key leads
-- with faq_id, so that lookup needs its own index.
CREATE INDEX IF NOT EXISTS "faq_services_service_id_idx" ON "faq_services" USING btree ("service_id");
