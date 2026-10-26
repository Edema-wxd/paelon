import { and, asc, eq, getTableColumns, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  doctorLocations,
  doctors,
  locations,
  type Doctor,
  type Location,
} from "@/lib/db/schema";

import {
  CACHE_TAGS,
  cachedRead,
  visibleFilter,
  visibleFilterWith,
  type ReadOptions,
} from "./shared";

/**
 * Same shape as `services.ts`: the query body once, parameterised by
 * `ReadOptions`, with a `cachedRead` wrapper around the non-draft case. A draft
 * read sees unpublished rows and never touches `unstable_cache` (spec §5,
 * decision C4).
 */

function selectDoctors(options: ReadOptions): Promise<Doctor[]> {
  return db()
    .select()
    .from(doctors)
    .where(visibleFilter(doctors, options))
    .orderBy(asc(doctors.order), asc(doctors.name));
}

const cachedDoctors = cachedRead(
  async (): Promise<Doctor[]> => selectDoctors({}),
  ["doctors", "published"],
  [CACHE_TAGS.doctors],
);

/** Published doctors, in display order. Draft mode adds unpublished ones. */
export async function getPublishedDoctors(
  options: ReadOptions = {},
): Promise<Doctor[]> {
  return options.draft ? selectDoctors(options) : cachedDoctors();
}

async function selectDoctorBySlug(
  slug: string,
  options: ReadOptions,
): Promise<Doctor | null> {
  const rows = await db()
    .select()
    .from(doctors)
    .where(visibleFilterWith(doctors, options, eq(doctors.slug, slug)))
    .limit(1);
  return rows[0] ?? null;
}

/** One doctor by slug, or null. Draft mode also resolves an unpublished one. */
export async function getDoctorBySlug(
  slug: string,
  options: ReadOptions = {},
): Promise<Doctor | null> {
  if (options.draft) return selectDoctorBySlug(slug, options);

  const read = cachedRead(
    async (s: string) => selectDoctorBySlug(s, {}),
    ["doctor", "by-slug"],
    [CACHE_TAGS.doctors, CACHE_TAGS.doctor(slug)],
  );
  return read(slug);
}

/** Published doctors practising at one branch. */
export async function getDoctorsByLocation(
  locationId: string,
  options: ReadOptions = {},
): Promise<Doctor[]> {
  return db()
    .select(getTableColumns(doctors))
    .from(doctors)
    .innerJoin(doctorLocations, eq(doctorLocations.doctorId, doctors.id))
    .where(
      visibleFilterWith(
        doctors,
        options,
        eq(doctorLocations.locationId, locationId),
      ),
    )
    .orderBy(asc(doctors.order), asc(doctors.name));
}

/**
 * The branches one doctor practises at, in display order.
 *
 * Joined the other way round from `getDoctorsByLocation`, and the visibility
 * filter applies to the *location*: an unpublished branch has no page to link
 * to, so it does not belong on a published profile. In draft mode both sides
 * open up together, which is what previewing a new doctor at a new branch
 * needs.
 */
export async function getLocationsByDoctor(
  doctorId: string,
  options: ReadOptions = {},
): Promise<Location[]> {
  return db()
    .select(getTableColumns(locations))
    .from(locations)
    .innerJoin(doctorLocations, eq(doctorLocations.locationId, locations.id))
    .where(
      visibleFilterWith(locations, options, eq(doctorLocations.doctorId, doctorId)),
    )
    .orderBy(asc(locations.order), asc(locations.name));
}

/**
 * A doctor's name and publish state by id, or null when deleted. Admin-only,
 * uncached: the author editor uses it to say whether its profile link shows.
 */
export async function getDoctorLinkState(
  id: string,
): Promise<{ name: string; published: boolean } | null> {
  const rows = await db()
    .select({ name: doctors.name, published: doctors.published })
    .from(doctors)
    .where(and(eq(doctors.id, id), isNull(doctors.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}
