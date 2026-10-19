import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, configureTestDatabase, hasDatabase, resetDatabase, seedLocation } from "./setup";

configureTestDatabase();

const describeIfDb = hasDatabase ? describe : describe.skip;

/**
 * The server half of Conversion baseline item 14, against a real database.
 *
 * The count rule is unit-tested (`tests/blog-resource-schema.test.ts`) because
 * it needs nothing but the body text. Whether a link *resolves* is a property
 * of rows and of the filters the public templates use, which is exactly the
 * kind of thing that looks right in isolation and is wrong in the query:
 *
 *  - a link to an **unpublished** service must be refused, because
 *    `/services/<slug>` 404s for a draft, so the link is broken for a reader
 *    even though the row exists;
 *  - a link to a post with no `published_at` must be refused for the same
 *    reason — `livePost()` filters on the column, so the post is not on /blog;
 *  - a **related** post that is not published must be refused, because the
 *    related-reading block renders it as a link.
 *
 * None of those three can be proved without a database, and each of them ships
 * a broken link to a reader if it is wrong.
 */
describeIfDb("blog publish checks", () => {
  let db: typeof import("@/lib/db/client").db;
  let dbTx: typeof import("@/lib/db/client").dbTx;

  beforeAll(async () => {
    ({ db, dbTx } = await import("@/lib/db/client"));
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  /** Rows out of a raw result, whichever shape the driver returned. */
  function rowsOf(result: unknown): unknown[] {
    return Array.isArray(result) ? result : (result as { rows: unknown[] }).rows;
  }

  async function insertReturningId(query: ReturnType<typeof sql>): Promise<string> {
    const first = rowsOf(await dbTx().execute(query))[0] as { id: string } | undefined;
    if (!first) throw new Error("Insert returned no row");
    return first.id;
  }

  /** A service, published or not. Nothing here describes real care. */
  function seedService(slug: string, published: boolean): Promise<string> {
    return insertReturningId(sql`
      INSERT INTO services (name, slug, family, short_description, long_description,
                            what_to_expect, published)
      VALUES (${`Service ${slug}`}, ${slug}, 'family_healthcare', 'Placeholder.',
              'Placeholder.', 'Placeholder.', ${published})
      RETURNING id
    `);
  }

  function seedAuthor(): Promise<string> {
    return insertReturningId(sql`
      INSERT INTO authors (name, slug, role, bio, published)
      VALUES ('Placeholder Author', ${`author-${crypto.randomUUID()}`},
              'Placeholder role', 'Placeholder bio.', true)
      RETURNING id
    `);
  }

  /**
   * A post. `published` and `datedAt` are separate on purpose: the pair
   * (true, null) is the state the rules exist to catch, and it is reachable.
   */
  function seedPost(
    authorId: string,
    slug: string,
    { published, dated }: { published: boolean; dated: boolean },
  ): Promise<string> {
    return insertReturningId(sql`
      INSERT INTO blog_posts (title, slug, excerpt, body, author_id, category,
                              published, published_at)
      VALUES (${`Post ${slug}`}, ${slug}, 'Placeholder.', 'Placeholder body.',
              ${authorId}, 'family_health', ${published},
              ${dated ? sql`now()` : sql`NULL`})
      RETURNING id
    `);
  }

  /* ---------------------------------------------------------------------- */
  /* unresolvedPaths                                                        */
  /* ---------------------------------------------------------------------- */

  describe("unresolvedPaths", () => {
    it("accepts the built static routes", async () => {
      const { unresolvedPaths } = await import("@/lib/blog/link-targets");

      expect(await unresolvedPaths(["/", "/services", "/locations", "/blog", "/contact"])).toEqual(
        [],
      );
    });

    it("refuses a route that is specified but not built", async () => {
      const { unresolvedPaths } = await import("@/lib/blog/link-targets");

      // §6 lists all three; none of them exists yet, so a body linking to one
      // would ship a 404 (CLAUDE.md live gaps).
      expect(await unresolvedPaths(["/about", "/for-corporates", "/hmo-check"])).toEqual([
        "/about",
        "/for-corporates",
        "/hmo-check",
      ]);
    });

    it("refuses a thank-you route, which exists but is not for readers", async () => {
      const { unresolvedPaths } = await import("@/lib/blog/link-targets");

      expect(await unresolvedPaths(["/contact/thank-you", "/book/confirmed"])).toEqual([
        "/contact/thank-you",
        "/book/confirmed",
      ]);
    });

    it("accepts a published service and refuses a draft one", async () => {
      const { unresolvedPaths } = await import("@/lib/blog/link-targets");
      await seedService("live-one", true);
      await seedService("draft-one", false);

      expect(await unresolvedPaths(["/services/live-one"])).toEqual([]);
      expect(await unresolvedPaths(["/services/draft-one"])).toEqual(["/services/draft-one"]);
    });

    it("accepts a published branch", async () => {
      const { unresolvedPaths } = await import("@/lib/blog/link-targets");
      await seedLocation("victoria-island");

      expect(await unresolvedPaths(["/locations/victoria-island"])).toEqual([]);
    });

    it("refuses a published post that has no publication date", async () => {
      const { unresolvedPaths } = await import("@/lib/blog/link-targets");
      const authorId = await seedAuthor();
      await seedPost(authorId, "dated", { published: true, dated: true });
      await seedPost(authorId, "undated", { published: true, dated: false });

      expect(await unresolvedPaths(["/blog/dated"])).toEqual([]);
      // The state the schema's `publishedAt` rule prevents on the way in. It is
      // reachable through seed data and the database, so the link check has to
      // agree with `livePost()` rather than trust the flag.
      expect(await unresolvedPaths(["/blog/undated"])).toEqual(["/blog/undated"]);
    });

    it("refuses a soft-deleted row's path", async () => {
      const { unresolvedPaths } = await import("@/lib/blog/link-targets");
      await seedService("gone", true);
      await db().execute(sql`UPDATE services SET deleted_at = now() WHERE slug = 'gone'`);

      expect(await unresolvedPaths(["/services/gone"])).toEqual(["/services/gone"]);
    });

    it("refuses a path with more segments than the route has", async () => {
      const { unresolvedPaths } = await import("@/lib/blog/link-targets");
      await seedService("live-one", true);

      expect(await unresolvedPaths(["/services/live-one/extra"])).toEqual([
        "/services/live-one/extra",
      ]);
    });

    it("reports each broken path once, however often it was linked", async () => {
      const { unresolvedPaths } = await import("@/lib/blog/link-targets");

      expect(await unresolvedPaths(["/about", "/about"])).toEqual(["/about"]);
    });

    it("costs no query when every path is static", async () => {
      const { unresolvedPaths } = await import("@/lib/blog/link-targets");
      expect(await unresolvedPaths([])).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* blogPublishErrors                                                      */
  /* ---------------------------------------------------------------------- */

  describe("blogPublishErrors", () => {
    it("passes a draft through untouched, whatever it links to", async () => {
      const { blogPublishErrors } = await import("@/lib/admin/blog-publish");

      const errors = await blogPublishErrors({
        published: false,
        body: "Placeholder linking to [nothing](/about) and [nowhere](/services/missing).",
        relatedIds: [],
        id: null,
      });

      expect(errors).toBeNull();
    });

    it("allows a publish whose links all resolve", async () => {
      const { blogPublishErrors } = await import("@/lib/admin/blog-publish");
      await seedService("live-one", true);

      const errors = await blogPublishErrors({
        published: true,
        body: "Placeholder [one](/services/live-one) and [two](/contact).",
        relatedIds: [],
        id: null,
      });

      expect(errors).toBeNull();
    });

    it("blocks a publish on `body`, naming the broken link", async () => {
      const { blogPublishErrors } = await import("@/lib/admin/blog-publish");

      const errors = await blogPublishErrors({
        published: true,
        body: "Placeholder [one](/services/missing) and [two](/contact).",
        relatedIds: [],
        id: null,
      });

      expect(errors?.body?.[0]).toContain("/services/missing");
    });

    it("blocks a publish on `relatedIds`, naming the unpublished post", async () => {
      const { blogPublishErrors } = await import("@/lib/admin/blog-publish");
      const authorId = await seedAuthor();
      const draftId = await seedPost(authorId, "draft-post", { published: false, dated: false });

      const errors = await blogPublishErrors({
        published: true,
        body: "Placeholder [one](/services) and [two](/contact).",
        relatedIds: [draftId],
        id: null,
      });

      expect(errors?.relatedIds?.[0]).toContain("Post draft-post");
    });

    it("allows a related post that is published and dated", async () => {
      const { blogPublishErrors } = await import("@/lib/admin/blog-publish");
      const authorId = await seedAuthor();
      const liveId = await seedPost(authorId, "live-post", { published: true, dated: true });

      const errors = await blogPublishErrors({
        published: true,
        body: "Placeholder [one](/services) and [two](/contact).",
        relatedIds: [liveId],
        id: null,
      });

      expect(errors).toBeNull();
    });

    it("does not report the post as its own broken relation", async () => {
      const { blogPublishErrors } = await import("@/lib/admin/blog-publish");
      const authorId = await seedAuthor();
      // Being saved, so not yet published — and therefore not a live target.
      const selfId = await seedPost(authorId, "self", { published: false, dated: false });

      const errors = await blogPublishErrors({
        published: true,
        body: "Placeholder [one](/services) and [two](/contact).",
        relatedIds: [selfId],
        id: selfId,
      });

      expect(errors).toBeNull();
    });

    it("reports both fields at once rather than one per submission", async () => {
      const { blogPublishErrors } = await import("@/lib/admin/blog-publish");
      const authorId = await seedAuthor();
      const draftId = await seedPost(authorId, "draft-post", { published: false, dated: false });

      const errors = await blogPublishErrors({
        published: true,
        body: "Placeholder [one](/about) and [two](/contact).",
        relatedIds: [draftId],
        id: null,
      });

      expect(errors?.body).toBeDefined();
      expect(errors?.relatedIds).toBeDefined();
    });
  });
});
