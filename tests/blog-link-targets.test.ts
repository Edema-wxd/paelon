import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { blogPosts, doctors, locations, services } from "@/lib/db/schema";

/**
 * The routing half of `unresolvedPaths` (Conversion baseline item 14): which
 * paths are static, which prefix a slug is looked up under, and that each
 * lookup carries the public guard. Row behaviour against a real database is in
 * `tests/integration/blog-publish.test.ts`.
 *
 * The mock compiles each `where` to SQL and answers from a fixed set of "live"
 * slugs per table, filtered by the slugs the query actually asked for. Slugs
 * are placeholders, not Paelon content.
 */

const dialect = new PgDialect();

type Query = { table: unknown; sql: string; params: unknown[] };
const queries: Query[] = [];

const LIVE = new Map<unknown, string[]>([
  [services, ["live-service"]],
  [locations, ["live-branch"]],
  [doctors, ["live-doctor"]],
  [blogPosts, ["live-post"]],
]);

vi.mock("@/lib/db/client", () => ({
  db: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: async (condition: SQL) => {
          const compiled = dialect.sqlToQuery(condition);
          queries.push({ table, sql: compiled.sql, params: compiled.params });
          return (LIVE.get(table) ?? [])
            .filter((slug) => compiled.params.includes(slug))
            .map((slug) => ({ slug }));
        },
      }),
    }),
  }),
}));

const { STATIC_ROUTES, unresolvedPaths } = await import("@/lib/blog/link-targets");

beforeEach(() => {
  queries.length = 0;
});

describe("STATIC_ROUTES", () => {
  it("includes the built About and specialists pages", () => {
    expect(STATIC_ROUTES.has("/about")).toBe(true);
    expect(STATIC_ROUTES.has("/doctors")).toBe(true);
  });

  it("excludes pages §6 specifies but nobody has built", () => {
    expect(STATIC_ROUTES.has("/for-corporates")).toBe(false);
    expect(STATIC_ROUTES.has("/hmo-check")).toBe(false);
  });
});

describe("unresolvedPaths", () => {
  it("accepts /about and /doctors without touching the database", async () => {
    expect(await unresolvedPaths(["/about", "/doctors"])).toEqual([]);
    expect(queries).toEqual([]);
  });

  it("refuses unbuilt and thank-you routes without touching the database", async () => {
    expect(
      await unresolvedPaths(["/for-corporates", "/hmo-check", "/contact/thank-you"]),
    ).toEqual(["/for-corporates", "/hmo-check", "/contact/thank-you"]);
    expect(queries).toEqual([]);
  });

  it("resolves a doctor profile against the doctors table", async () => {
    expect(await unresolvedPaths(["/doctors/live-doctor"])).toEqual([]);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.table).toBe(doctors);
  });

  it("refuses a doctor slug that is not a public row", async () => {
    expect(await unresolvedPaths(["/doctors/missing-doctor"])).toEqual([
      "/doctors/missing-doctor",
    ]);
  });

  it("filters doctors on published and not deleted", async () => {
    await unresolvedPaths(["/doctors/live-doctor"]);
    const query = queries[0];
    expect(query?.sql).toContain('"doctors"."published" = $1');
    expect(query?.sql).toContain('"doctors"."deleted_at" is null');
    expect(query?.params[0]).toBe(true);
  });

  it("refuses a doctor path with more segments than the route has", async () => {
    expect(await unresolvedPaths(["/doctors/live-doctor/extra"])).toEqual([
      "/doctors/live-doctor/extra",
    ]);
    expect(queries).toEqual([]);
  });

  it("does not look a doctor slug up under another table", async () => {
    // A slug that is live as a service is still broken under /doctors.
    expect(await unresolvedPaths(["/doctors/live-service"])).toEqual([
      "/doctors/live-service",
    ]);
    expect(queries.map((query) => query.table)).toEqual([doctors]);
  });

  it("issues one query per prefix used", async () => {
    expect(
      await unresolvedPaths([
        "/doctors/live-doctor",
        "/services/live-service",
        "/doctors/missing-doctor",
        "/about",
      ]),
    ).toEqual(["/doctors/missing-doctor"]);
    expect(new Set(queries.map((query) => query.table))).toEqual(new Set([doctors, services]));
  });
});
