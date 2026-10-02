import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { locations, type Location } from "@/lib/db/schema";

import {
  CACHE_TAGS,
  cachedRead,
  publicFilterWith,
  visibleFilter,
  visibleFilterWith,
  type ReadOptions,
} from "./shared";

function selectLocations(options: ReadOptions): Promise<Location[]> {
  return db()
    .select()
    .from(locations)
    .where(visibleFilter(locations, options))
    .orderBy(asc(locations.order), asc(locations.name));
}

const cachedLocations = cachedRead(
  async (): Promise<Location[]> => selectLocations({}),
  ["locations", "published"],
  [CACHE_TAGS.locations],
);

/** Published branches, in display order. Draft mode adds unpublished ones. */
export async function getPublishedLocations(
  options: ReadOptions = {},
): Promise<Location[]> {
  return options.draft ? selectLocations(options) : cachedLocations();
}

async function selectLocationBySlug(
  slug: string,
  options: ReadOptions,
): Promise<Location | null> {
  const rows = await db()
    .select()
    .from(locations)
    .where(visibleFilterWith(locations, options, eq(locations.slug, slug)))
    .limit(1);
  return rows[0] ?? null;
}

/** One branch by slug, or null. Draft mode also resolves an unpublished one. */
export async function getLocationBySlug(
  slug: string,
  options: ReadOptions = {},
): Promise<Location | null> {
  if (options.draft) return selectLocationBySlug(slug, options);

  const read = cachedRead(
    async (s: string) => selectLocationBySlug(s, {}),
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
 *
 * Takes no `ReadOptions` on purpose. A real patient booking must never resolve
 * to an unpublished branch, whatever cookie the browser is carrying.
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
