import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, configureTestDatabase, hasDatabase, resetDatabase, seedLocation } from "./setup";

configureTestDatabase();

const describeIfDb = hasDatabase ? describe : describe.skip;

/**
 * The admin CRUD kit against a real database.
 *
 * Three things here cannot be proved without one, and each of them is a way the
 * public site breaks quietly rather than loudly:
 *
 *  - **join rows.** `syncRelation` deletes and re-inserts, so a bug leaves a
 *    service attached to no branches with no error anywhere.
 *  - **the HMO typeahead.** `searchHmos` matches aliases through the
 *    `hmo_aliases_text` SQL function and a trigram index. Whether a newly typed
 *    alias is findable is a property of that query, not of the form.
 *  - **`/book?service=` after an unpublish.** The deep link must degrade to
 *    step 1 rather than dead-ending, which depends on `getServiceBySlug`
 *    filtering on `published`.
 */
describeIfDb("admin content CRUD", () => {
  let db: typeof import("@/lib/db/client").db;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db/client"));
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  /** A service row, written through the repository the admin action uses. */
  async function createService(slug: string, published: boolean) {
    const { createContent } = await import("@/lib/db/queries/content-crud");
    const { services } = await import("@/lib/db/schema");

    return createContent(
      services as never,
      {
        name: `Service ${slug}`,
        slug,
        family: "family_healthcare",
        shortDescription: "Placeholder.",
        longDescription: "Placeholder.",
        whatToExpect: "Placeholder.",
        published,
      },
      // No signed-in user in these tests; ownership is exercised in the policy suite.
      null as unknown as string,
    );
  }

  describe("join tables", () => {
    it("writes, replaces and clears a service's branches", async () => {
      const { listRelationIds, syncRelation } = await import("@/lib/db/queries/content-crud");
      const { RESOURCE_SERVER } = await import("@/lib/admin/resources/server");

      const relation = RESOURCE_SERVER.services.relations?.[0];
      if (!relation) throw new Error("services has no location relation");

      const service = await createService("joins", true);
      const branchA = await seedLocation("branch-a");
      const branchB = await seedLocation("branch-b");

      await syncRelation(relation.columns, service.id, [branchA, branchB]);
      expect((await listRelationIds(relation.columns, service.id)).sort()).toEqual(
        [branchA, branchB].sort(),
      );

      await syncRelation(relation.columns, service.id, [branchB]);
      expect(await listRelationIds(relation.columns, service.id)).toEqual([branchB]);

      await syncRelation(relation.columns, service.id, []);
      expect(await listRelationIds(relation.columns, service.id)).toEqual([]);
    });

    it("never relates a service to itself", async () => {
      const { listRelationIds, syncRelation } = await import("@/lib/db/queries/content-crud");
      const { RESOURCE_SERVER } = await import("@/lib/admin/resources/server");

      const relation = RESOURCE_SERVER.services.relations?.[1];
      if (!relation) throw new Error("services has no related relation");

      const one = await createService("self-a", true);
      const two = await createService("self-b", true);

      await syncRelation(relation.columns, one.id, [one.id, two.id]);
      expect(await listRelationIds(relation.columns, one.id)).toEqual([two.id]);
    });

    it("keeps a join to a soft-deleted row when the form is saved again", async () => {
      // The picker cannot show a deleted branch, so the submission cannot name
      // it. A blanket delete would drop the membership the first time anyone
      // saved for an unrelated reason, and the undelete would bring the branch
      // back with nothing pointing at it.
      const { listRelationIds, softDeleteContent, syncRelation } = await import(
        "@/lib/db/queries/content-crud"
      );
      const { RESOURCE_SERVER } = await import("@/lib/admin/resources/server");
      const { locations } = await import("@/lib/db/schema");

      const relation = RESOURCE_SERVER.services.relations?.[0];
      if (!relation) throw new Error("services has no location relation");

      const service = await createService("survives", true);
      const live = await seedLocation("live-branch");
      const doomed = await seedLocation("doomed-branch");

      await syncRelation(relation.columns, service.id, [live, doomed]);
      await softDeleteContent(locations as never, doomed);

      // The deleted branch is gone from the form's value...
      expect(await listRelationIds(relation.columns, service.id)).toEqual([live]);

      // ...and a save that only names the live one leaves its row alone.
      await syncRelation(relation.columns, service.id, [live]);

      const all = await db().execute(
        sql`SELECT location_id FROM service_locations WHERE service_id = ${service.id}`,
      );
      const rows = Array.isArray(all) ? all : (all as { rows: unknown[] }).rows;
      expect(rows).toHaveLength(2);
    });

    it("writes the row and its branches in one transaction", async () => {
      const { createContentWithRelations, listRelationIds } = await import(
        "@/lib/db/queries/content-crud"
      );
      const { RESOURCE_SERVER } = await import("@/lib/admin/resources/server");
      const { services } = await import("@/lib/db/schema");

      const relation = RESOURCE_SERVER.services.relations?.[0];
      if (!relation) throw new Error("services has no location relation");

      const branch = await seedLocation("atomic-branch");
      const row = await createContentWithRelations(
        services as never,
        {
          name: "Atomic",
          slug: "atomic",
          family: "family_healthcare",
          shortDescription: "Placeholder.",
          longDescription: "Placeholder.",
          whatToExpect: "Placeholder.",
          published: true,
        },
        null as unknown as string,
        [{ columns: relation.columns, ids: [branch] }],
      );

      expect(await listRelationIds(relation.columns, row.id)).toEqual([branch]);
    });

    it("leaves nothing behind when a relation names a row that does not exist", async () => {
      // The foreign key is the only thing that can settle this race, so the
      // insert throws — and the content row must not survive it, or the slug is
      // taken by a row the editor cannot see or recreate.
      const { createContentWithRelations } = await import("@/lib/db/queries/content-crud");
      const { RESOURCE_SERVER } = await import("@/lib/admin/resources/server");
      const { services } = await import("@/lib/db/schema");

      const relation = RESOURCE_SERVER.services.relations?.[0];
      if (!relation) throw new Error("services has no location relation");

      await expect(
        createContentWithRelations(
          services as never,
          {
            name: "Rolled back",
            slug: "rolled-back",
            family: "family_healthcare",
            shortDescription: "Placeholder.",
            longDescription: "Placeholder.",
            whatToExpect: "Placeholder.",
            published: true,
          },
          null as unknown as string,
          [{ columns: relation.columns, ids: [crypto.randomUUID()] }],
        ),
      ).rejects.toThrow();

      const rows = await db().execute(
        sql`SELECT id FROM services WHERE slug = 'rolled-back'`,
      );
      const list = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows;
      expect(list).toHaveLength(0);
    });

    it("lists drafts as options, marked", async () => {
      const { listContentOptions } = await import("@/lib/db/queries/content-crud");
      const { services } = await import("@/lib/db/schema");

      await createService("visible", true);
      await createService("hidden", false);

      const options = await listContentOptions(services as never, services.name);
      expect(options.map((option) => option.published).sort()).toEqual([false, true]);
    });
  });

  describe("HMO aliases and the typeahead", () => {
    async function createHmo(name: string, slug: string, aliases: string[]) {
      const { createContent } = await import("@/lib/db/queries/content-crud");
      const { hmos } = await import("@/lib/db/schema");
      return createContent(
        hmos as never,
        { name, slug, aliases, published: true },
        null as unknown as string,
      );
    }

    it("finds an HMO by an alias added after the row was created", async () => {
      const { updateContent } = await import("@/lib/db/queries/content-crud");
      const { searchHmos } = await import("@/lib/db/queries/hmos");
      const { hmos } = await import("@/lib/db/schema");

      const row = await createHmo("Placeholder Insurance", "placeholder-insurance", []);

      // The abbreviation a patient would type, which nothing about the
      // canonical name would match.
      expect((await searchHmos("PHI")).map((hit) => hit.slug)).not.toContain(
        "placeholder-insurance",
      );

      await updateContent(hmos as never, row.id, { aliases: ["PHI"] });

      // `searchHmos` is deliberately uncached and reads `aliases` through
      // `hmo_aliases_text` on each request, so the new alias is live at once.
      expect((await searchHmos("PHI")).map((hit) => hit.slug)).toContain(
        "placeholder-insurance",
      );
    });

    it("keeps matching the canonical name and tolerates a typo in it", async () => {
      const { searchHmos } = await import("@/lib/db/queries/hmos");
      await createHmo("Placeholder Insurance", "placeholder-insurance", ["PHI"]);

      expect((await searchHmos("Placeholder")).map((hit) => hit.slug)).toContain(
        "placeholder-insurance",
      );
      expect((await searchHmos("Placehlder Insurance")).map((hit) => hit.slug)).toContain(
        "placeholder-insurance",
      );
    });

    it("hides an unpublished HMO from the typeahead, aliases included", async () => {
      const { softDeleteContent } = await import("@/lib/db/queries/content-crud");
      const { searchHmos } = await import("@/lib/db/queries/hmos");
      const { hmos } = await import("@/lib/db/schema");

      const row = await createHmo("Placeholder Insurance", "placeholder-insurance", ["PHI"]);
      await softDeleteContent(hmos as never, row.id);

      expect(await searchHmos("PHI")).toEqual([]);
    });

    it("lists the branches that accept an HMO", async () => {
      const { syncRelation } = await import("@/lib/db/queries/content-crud");
      const { searchHmos } = await import("@/lib/db/queries/hmos");
      const { RESOURCE_SERVER } = await import("@/lib/admin/resources/server");

      const relation = RESOURCE_SERVER.hmos.relations?.[0];
      if (!relation) throw new Error("hmos has no location relation");

      const row = await createHmo("Placeholder Insurance", "placeholder-insurance", ["PHI"]);
      await seedLocation("accepted-here");
      const branch = await db().execute(
        sql`SELECT id FROM locations WHERE slug = 'accepted-here'`,
      );
      const rows = Array.isArray(branch) ? branch : (branch as { rows: unknown[] }).rows;
      const branchId = (rows[0] as { id: string }).id;

      await syncRelation(relation.columns, row.id, [branchId]);

      const [hit] = await searchHmos("PHI");
      expect(hit?.locations).toEqual(["Victoria Island"]);
    });
  });

  describe("unpublishing a service the booking deep link targets", () => {
    it("drops the prefill instead of dead-ending, so /book starts at step 1", async () => {
      const { resolveBookingPrefill } = await import("@/lib/booking/submit");
      const { updateContent } = await import("@/lib/db/queries/content-crud");
      const { services } = await import("@/lib/db/schema");

      const service = await createService("deep-linked", true);
      await seedLocation("prefill-branch");

      const before = await resolveBookingPrefill({ service: "deep-linked", branch: null });
      expect(before.serviceSlug).toBe("deep-linked");
      expect(before.serviceFamily).toBe("family_healthcare");

      await updateContent(services as never, service.id, { published: false });

      // An empty prefill is what the wizard reads as "nothing chosen yet", and
      // `firstIncompleteStep` then opens on step 1.
      const after = await resolveBookingPrefill({ service: "deep-linked", branch: null });
      expect(after.serviceSlug).toBeUndefined();
      expect(after.serviceFamily).toBeUndefined();
      expect(after).toEqual({});
    });

    it("still pre-fills the branch when only the service is gone", async () => {
      const { resolveBookingPrefill } = await import("@/lib/booking/submit");
      await seedLocation("still-open");

      const prefill = await resolveBookingPrefill({
        service: "never-existed",
        branch: "still-open",
      });
      expect(prefill).toEqual({ locationSlug: "still-open" });
    });

    it("drops the prefill for a soft-deleted service too", async () => {
      const { resolveBookingPrefill } = await import("@/lib/booking/submit");
      const { softDeleteContent } = await import("@/lib/db/queries/content-crud");
      const { services } = await import("@/lib/db/schema");

      const service = await createService("deleted-deep-link", true);
      await softDeleteContent(services as never, service.id);

      expect(await resolveBookingPrefill({ service: "deleted-deep-link", branch: null })).toEqual(
        {},
      );
    });
  });
});
