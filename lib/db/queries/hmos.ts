import { asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { hmoLocations, hmos, locations, type Hmo } from "@/lib/db/schema";

import { CACHE_TAGS, cachedRead, publicFilter, publicFilterWith } from "./shared";

/** Public shape of an HMO search hit. Deliberately narrow — see /api/hmo/search. */
export interface HmoSearchResult {
  name: string;
  slug: string;
  copayApplies: boolean;
  coverageNotes: string | null;
  locations: string[];
}

/** Maximum typeahead results (backend spec §8). */
export const HMO_SEARCH_LIMIT = 10;

/** Published HMOs, in display order. */
export const getPublishedHmos = cachedRead(
  async (): Promise<Hmo[]> =>
    db()
      .select()
      .from(hmos)
      .where(publicFilter(hmos))
      .orderBy(asc(hmos.order), asc(hmos.name)),
  ["hmos", "published"],
  [CACHE_TAGS.hmos],
);

/** One published HMO by slug, or null. */
export async function getHmoBySlug(slug: string): Promise<Hmo | null> {
  const read = cachedRead(
    async (s: string) => {
      const rows = await db()
        .select()
        .from(hmos)
        .where(publicFilterWith(hmos, eq(hmos.slug, s)))
        .limit(1);
      return rows[0] ?? null;
    },
    ["hmo", "by-slug"],
    [CACHE_TAGS.hmos, CACHE_TAGS.hmo(slug)],
  );
  return read(slug);
}

/**
 * Typeahead search over HMO name and aliases.
 *
 * Ranked by trigram similarity so "axa mansrd" still finds "AXA Mansard", and
 * aliases are searched alongside the canonical name so "AXA" resolves to one
 * record rather than missing.
 *
 * A prefix match is also accepted (`ILIKE q%`) because trigram similarity is
 * poor for very short queries — "AX" shares few trigrams with anything — and a
 * typeahead's first two keystrokes are exactly where it must still work.
 *
 * `sql` here is parameterised by Drizzle; no string is interpolated into SQL.
 */
export async function searchHmos(
  query: string,
  limit = HMO_SEARCH_LIMIT,
): Promise<HmoSearchResult[]> {
  const q = query.trim();
  if (q.length === 0) return [];

  const aliasText = sql<string>`hmo_aliases_text(${hmos.aliases})`;
  const score = sql<number>`greatest(
    similarity(${hmos.name}, ${q}),
    similarity(${aliasText}, ${q}),
    case when ${hmos.name} ilike ${q + "%"} then 1 else 0 end,
    case when ${aliasText} ilike ${"%" + q + "%"} then 0.9 else 0 end
  )`;

  const rows = await db()
    .select({
      name: hmos.name,
      slug: hmos.slug,
      copayApplies: hmos.copayApplies,
      coverageNotes: hmos.coverageNotes,
      score,
    })
    .from(hmos)
    .where(publicFilterWith(hmos, sql`${score} > 0.2`))
    .orderBy(sql`${score} desc`, asc(hmos.name))
    .limit(limit);

  if (rows.length === 0) return [];

  // Branch names for the hits, in one round trip rather than N.
  const slugs = rows.map((r) => r.slug);
  const branchRows = await db()
    .select({ hmoSlug: hmos.slug, locationName: locations.name })
    .from(hmoLocations)
    .innerJoin(hmos, eq(hmos.id, hmoLocations.hmoId))
    .innerJoin(locations, eq(locations.id, hmoLocations.locationId))
    .where(publicFilterWith(locations, inArray(hmos.slug, slugs)))
    .orderBy(asc(locations.order));

  const byHmo = new Map<string, string[]>();
  for (const row of branchRows) {
    const list = byHmo.get(row.hmoSlug) ?? [];
    list.push(row.locationName);
    byHmo.set(row.hmoSlug, list);
  }

  return rows.map((r) => ({
    name: r.name,
    slug: r.slug,
    copayApplies: r.copayApplies,
    coverageNotes: r.coverageNotes,
    locations: byHmo.get(r.slug) ?? [],
  }));
}

/** Resolve an HMO slug to its id for booking submission. Not cached. */
export async function resolveHmoId(slug: string): Promise<string | null> {
  const rows = await db()
    .select({ id: hmos.id })
    .from(hmos)
    .where(publicFilterWith(hmos, eq(hmos.slug, slug)))
    .limit(1);
  return rows[0]?.id ?? null;
}
