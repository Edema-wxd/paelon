import { asc, eq, getTableColumns, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  serviceLocations,
  serviceRelated,
  services,
  type Service,
  type ServiceFamily,
} from "@/lib/db/schema";

import {
  CACHE_TAGS,
  cachedRead,
  visibleFilter,
  visibleFilterWith,
  type ReadOptions,
} from "./shared";

/**
 * Each public read here exists twice over: the query body, written once and
 * parameterised by `ReadOptions`, and a `cachedRead` wrapper around the
 * non-draft case. A draft read calls the body directly, so it sees unpublished
 * rows and never touches `unstable_cache` (spec §5, decision C4).
 */

function selectServices(options: ReadOptions): Promise<Service[]> {
  return db()
    .select()
    .from(services)
    .where(visibleFilter(services, options))
    .orderBy(asc(services.order), asc(services.name));
}

const cachedServices = cachedRead(
  async (): Promise<Service[]> => selectServices({}),
  ["services", "published"],
  [CACHE_TAGS.services],
);

/** Published services, in display order. Draft mode adds unpublished ones. */
export async function getPublishedServices(
  options: ReadOptions = {},
): Promise<Service[]> {
  return options.draft ? selectServices(options) : cachedServices();
}

async function selectServiceBySlug(
  slug: string,
  options: ReadOptions,
): Promise<Service | null> {
  const rows = await db()
    .select()
    .from(services)
    .where(visibleFilterWith(services, options, eq(services.slug, slug)))
    .limit(1);
  return rows[0] ?? null;
}

/** One service by slug, or null. Draft mode also resolves an unpublished one. */
export async function getServiceBySlug(
  slug: string,
  options: ReadOptions = {},
): Promise<Service | null> {
  if (options.draft) return selectServiceBySlug(slug, options);

  const read = cachedRead(
    async (s: string) => selectServiceBySlug(s, {}),
    ["service", "by-slug"],
    [CACHE_TAGS.services, CACHE_TAGS.service(slug)],
  );
  return read(slug);
}

/** Published services in one family. */
export async function getServicesByFamily(
  family: ServiceFamily,
  options: ReadOptions = {},
): Promise<Service[]> {
  return db()
    .select()
    .from(services)
    .where(visibleFilterWith(services, options, eq(services.family, family)))
    .orderBy(asc(services.order), asc(services.name));
}

/** Published services offered at one branch. */
export async function getServicesByLocation(
  locationId: string,
  options: ReadOptions = {},
): Promise<Service[]> {
  return db()
    .select(getTableColumns(services))
    .from(services)
    .innerJoin(serviceLocations, eq(serviceLocations.serviceId, services.id))
    .where(
      visibleFilterWith(
        services,
        options,
        eq(serviceLocations.locationId, locationId),
      ),
    )
    .orderBy(asc(services.order), asc(services.name));
}

/** Published services related to the given one. */
export async function getRelatedServices(
  serviceId: string,
  options: ReadOptions = {},
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
    .where(visibleFilterWith(services, options, inArray(services.id, ids)))
    .orderBy(asc(services.order), asc(services.name));
}
