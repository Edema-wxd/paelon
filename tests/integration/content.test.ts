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
