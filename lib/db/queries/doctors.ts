import { asc, eq, getTableColumns } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { doctorLocations, doctors, type Doctor } from "@/lib/db/schema";

import { CACHE_TAGS, cachedRead, publicFilter, publicFilterWith } from "./shared";

/** Published doctors, in display order. */
export const getPublishedDoctors = cachedRead(
  async (): Promise<Doctor[]> =>
    db()
      .select()
      .from(doctors)
      .where(publicFilter(doctors))
      .orderBy(asc(doctors.order), asc(doctors.name)),
  ["doctors", "published"],
  [CACHE_TAGS.doctors],
);

/** One published doctor by slug, or null. */
export async function getDoctorBySlug(slug: string): Promise<Doctor | null> {
  const read = cachedRead(
    async (s: string) => {
      const rows = await db()
        .select()
        .from(doctors)
        .where(publicFilterWith(doctors, eq(doctors.slug, s)))
        .limit(1);
      return rows[0] ?? null;
    },
    ["doctor", "by-slug"],
    [CACHE_TAGS.doctors, CACHE_TAGS.doctor(slug)],
  );
  return read(slug);
}

/** Published doctors practising at one branch. */
export async function getDoctorsByLocation(
  locationId: string,
): Promise<Doctor[]> {
  return db()
    .select(getTableColumns(doctors))
    .from(doctors)
    .innerJoin(doctorLocations, eq(doctorLocations.doctorId, doctors.id))
    .where(publicFilterWith(doctors, eq(doctorLocations.locationId, locationId)))
    .orderBy(asc(doctors.order), asc(doctors.name));
}
