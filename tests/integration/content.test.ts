import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, hasDatabase, resetDatabase, configureTestDatabase } from "./setup";

configureTestDatabase();

const describeIfDb = hasDatabase ? describe : describe.skip;

/**
 * The soft-delete and consent guards.
 *
 * These are the tests that matter most for the public site: a draft or deleted
 * page leaking onto a hospital's marketing site, or an unconsented patient
 * testimonial being published, are both real-world harms rather than bugs.
 */
describeIfDb("public read guards", () => {
  let db: typeof import("@/lib/db/client").db;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db/client"));
  });

  beforeEach(async () => {
    await resetDatabase();

    await db().execute(sql`
      INSERT INTO services (name, slug, family, short_description, long_description,
                            what_to_expect, published, deleted_at)
      VALUES
        ('Published',   'published-service',   'family_healthcare', 's', 'l', 'w', true,  NULL),
        ('Draft',       'draft-service',       'family_healthcare', 's', 'l', 'w', false, NULL),
        ('Soft deleted','deleted-service',     'family_healthcare', 's', 'l', 'w', true,  now())
    `);
  });

  afterAll(async () => {
    await closePool();
  });

  it("returns only the published, undeleted service", async () => {
    const { getPublishedServices } = await import("@/lib/db/queries/services");
    const services = await getPublishedServices();

    expect(services.map((s) => s.slug)).toEqual(["published-service"]);
  });

  it("does not resolve a draft service by slug", async () => {
    const { getServiceBySlug } = await import("@/lib/db/queries/services");
    expect(await getServiceBySlug("draft-service")).toBeNull();
  });

  it("does not resolve a soft-deleted service by slug", async () => {
    const { getServiceBySlug } = await import("@/lib/db/queries/services");
    expect(await getServiceBySlug("deleted-service")).toBeNull();
  });

  /**
   * The draft-mode half of the same guards (spec §8, decision C4). `{ draft:
   * true }` is what `lib/content.ts` passes down when the preview cookie is
   * present, and what it must and must not lift is the whole point: the
   * unpublished row appears, the soft-deleted one still does not.
   */
  it("resolves a draft service by slug in draft mode", async () => {
    const { getServiceBySlug } = await import("@/lib/db/queries/services");

    const service = await getServiceBySlug("draft-service", { draft: true });
    expect(service?.slug).toBe("draft-service");
    expect(service?.published).toBe(false);
  });

  it("still refuses a soft-deleted service in draft mode", async () => {
    const { getServiceBySlug } = await import("@/lib/db/queries/services");
    expect(await getServiceBySlug("deleted-service", { draft: true })).toBeNull();
  });

  it("lists drafts alongside published rows in draft mode", async () => {
    const { getPublishedServices } = await import("@/lib/db/queries/services");

    const services = await getPublishedServices({ draft: true });
    expect(services.map((s) => s.slug).sort()).toEqual([
      "draft-service",
      "published-service",
    ]);
  });

  it("hides a published testimonial that has no recorded consent", async () => {
    const { getFeaturedTestimonials } = await import(
      "@/lib/db/queries/testimonials"
    );

    await db().execute(sql`
      INSERT INTO testimonials (slug, patient_name, quote, date_given, featured,
                                published, consent_given)
      VALUES
        ('consented',   'A Patient', 'q', '2026-01-01', true, true, true),
        ('unconsented', 'B Patient', 'q', '2026-01-01', true, true, false)
    `);

    const featured = await getFeaturedTestimonials(10);
    expect(featured.map((t) => t.slug)).toEqual(["consented"]);

    // Draft mode lifts `published`, never consent: a preview URL is a real URL,
    // and an unconsented quote on one is still published to whoever holds it.
    const inDraft = await getFeaturedTestimonials(10, { draft: true });
    expect(inDraft.map((t) => t.slug)).toEqual(["consented"]);
  });

  /**
   * The same guard, one layer up: through `lib/content.ts`, which is the module
   * `components/site/testimonials-section.tsx` imports and the only way the
   * homepage reaches a testimonial.
   *
   * It stops at the content layer rather than rendering the component, because
   * the unit runner has no JSX transform — `vitest.config.mts` includes `.ts`
   * only and there is no React plugin, both of which are config changes that
   * need Francis. What the component does with the result is one guard:
   * `if (testimonials.length === 0) return null`. So an empty array here is the
   * homepage rendering no testimonial section at all, and a one-element array
   * is the section rendering exactly that one quote.
   */
  it("keeps a published, featured, unconsented quote off the homepage", async () => {
    const { getFeaturedTestimonials } = await import("@/lib/content");

    await db().execute(sql`
      INSERT INTO testimonials (slug, patient_name, quote, date_given, featured,
                                published, consent_given)
      VALUES ('no-consent', 'B Patient', 'Placeholder quote.', '2026-01-01',
              true, true, false)
    `);

    // Everything an editor can set from /admin/testimonials is set to its most
    // visible value. Consent is the only thing withheld, and it is enough.
    expect(await getFeaturedTestimonials()).toEqual([]);
  });

  it("shows a consented quote beside it, and only that one", async () => {
    const { getFeaturedTestimonials } = await import("@/lib/content");

    await db().execute(sql`
      INSERT INTO testimonials (slug, patient_name, quote, date_given, featured,
                                published, consent_given)
      VALUES
        ('consented-b',   'C Patient', 'Consented placeholder quote.',   '2026-01-01', true, true, true),
        ('unconsented-b', 'D Patient', 'Unconsented placeholder quote.', '2026-01-01', true, true, false)
    `);

    const shown = await getFeaturedTestimonials();
    expect(shown.map((t) => t.slug)).toEqual(["consented-b"]);
    // The homepage renders `quote` verbatim, so this is the string that would
    // have reached the page.
    expect(shown.map((t) => t.quote)).not.toContain("Unconsented placeholder quote.");
  });
});

describeIfDb("seed idempotency", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  it("leaves row counts unchanged when run twice", async () => {
    const { execSync } = await import("node:child_process");
    const { db } = await import("@/lib/db/client");

    const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL };

    execSync("npx tsx lib/db/seed.ts", { env, stdio: "pipe" });
    const first = await counts(db);

    execSync("npx tsx lib/db/seed.ts", { env, stdio: "pipe" });
    const second = await counts(db);

    // Upsert-on-slug, not blind insert. A re-seed must not duplicate content.
    expect(second).toEqual(first);
    expect(first.services).toBeGreaterThan(0);
  });
});

async function counts(
  db: typeof import("@/lib/db/client").db,
): Promise<Record<string, number>> {
  const result = await db().execute(sql`
    SELECT
      (SELECT count(*)::int FROM services)          AS services,
      (SELECT count(*)::int FROM locations)         AS locations,
      (SELECT count(*)::int FROM hmos)              AS hmos,
      (SELECT count(*)::int FROM testimonials)      AS testimonials,
      (SELECT count(*)::int FROM service_locations) AS service_locations
  `);

  const list = Array.isArray(result) ? result : (result as { rows: unknown[] }).rows;
  return list[0] as Record<string, number>;
}
