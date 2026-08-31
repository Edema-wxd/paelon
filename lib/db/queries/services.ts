import { asc, eq, getTableColumns, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  serviceLocations,
  serviceRelated,
  services,
  type Service,
  type ServiceFamily,
} from "@/lib/db/schema";

import { CACHE_TAGS, cachedRead, publicFilter, publicFilterWith } from "./shared";

/** Published services, in display order. */
export const getPublishedServices = cachedRead(
  async (): Promise<Service[]> =>
    db()
      .select()
      .from(services)
      .where(publicFilter(services))
      .orderBy(asc(services.order), asc(services.name)),
  ["services", "published"],
  [CACHE_TAGS.services],
);

/** One published service by slug, or null. */
export async function getServiceBySlug(slug: string): Promise<Service | null> {
  const read = cachedRead(
    async (s: string) => {
      const rows = await db()
        .select()
        .from(services)
        .where(publicFilterWith(services, eq(services.slug, s)))
        .limit(1);
      return rows[0] ?? null;
    },
    ["service", "by-slug"],
    [CACHE_TAGS.services, CACHE_TAGS.service(slug)],
  );
  return read(slug);
}

/** Published services in one family. */
export async function getServicesByFamily(
  family: ServiceFamily,
): Promise<Service[]> {
  return db()
    .select()
    .from(services)
    .where(publicFilterWith(services, eq(services.family, family)))
    .orderBy(asc(services.order), asc(services.name));
}

/** Published services offered at one branch. */
export async function getServicesByLocation(
  locationId: string,
): Promise<Service[]> {
  return db()
    .select(getTableColumns(services))
    .from(services)
    .innerJoin(serviceLocations, eq(serviceLocations.serviceId, services.id))
    .where(
      publicFilterWith(services, eq(serviceLocations.locationId, locationId)),
    )
    .orderBy(asc(services.order), asc(services.name));
}

/** Published services related to the given one. */
export async function getRelatedServices(
  serviceId: string,
): Promise<Service[]> {
  const links = await db()
    .select({ relatedId: serviceRelated.relatedId })
    .from(serviceRelated)
    .where(eq(serviceRelated.serviceId, serviceId));

  const ids = links.map((l) => l.relatedId);
  if (ids.length === 0) return [];

  return db()
    .select()
    .from(services)
    .where(publicFilterWith(services, inArray(services.id, ids)))
    .orderBy(asc(services.order), asc(services.name));
}
