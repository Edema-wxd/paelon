import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { locations, type Location } from "@/lib/db/schema";

import { CACHE_TAGS, cachedRead, publicFilter, publicFilterWith } from "./shared";

/** Published branches, in display order. */
export const getPublishedLocations = cachedRead(
  async (): Promise<Location[]> =>
    db()
      .select()
      .from(locations)
      .where(publicFilter(locations))
      .orderBy(asc(locations.order), asc(locations.name)),
  ["locations", "published"],
  [CACHE_TAGS.locations],
);

/** One published branch by slug, or null. */
export async function getLocationBySlug(
  slug: string,
): Promise<Location | null> {
  const read = cachedRead(
    async (s: string) => {
      const rows = await db()
        .select()
        .from(locations)
        .where(publicFilterWith(locations, eq(locations.slug, s)))
        .limit(1);
      return rows[0] ?? null;
    },
    ["location", "by-slug"],
    [CACHE_TAGS.locations, CACHE_TAGS.location(slug)],
  );
  return read(slug);
}

/**
 * Resolve a branch slug to the fields booking needs.
 *
 * Not cached: this runs inside booking submission, where a stale answer would
 * attach a booking to the wrong branch. Cheap enough as a direct read.
 */
export async function resolveLocationForBooking(
  slug: string,
): Promise<{
  id: string;
  slug: string;
  name: string;
  phone: string;
  bookingEmail: string | null;
} | null> {
  const rows = await db()
    .select({
      id: locations.id,
      slug: locations.slug,
      name: locations.name,
      phone: locations.phone,
      bookingEmail: locations.bookingEmail,
    })
    .from(locations)
    .where(publicFilterWith(locations, eq(locations.slug, slug)))
    .limit(1);

  return rows[0] ?? null;
}
