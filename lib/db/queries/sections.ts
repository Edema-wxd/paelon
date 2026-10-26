import { and, asc, eq, isNull } from "drizzle-orm";

import { db, dbTx } from "@/lib/db/client";
import { contentSections } from "@/lib/db/schema";
import { sectionSchema, type Section } from "@/lib/validation/sections";

import { CACHE_TAGS, cachedRead } from "./shared";

/**
 * `content_sections` (migration 0008): the rearrangeable blocks on service
 * pages and the About page.
 *
 * Reads parse every row with the shared schema and drop any that fail, so a
 * row written by hand or by an older version of the editor degrades to a
 * missing block rather than a crashed page. Writes replace a page's whole set
 * in one transaction — the editor saves the layout, not individual blocks —
 * so a failed save leaves the previous layout intact, never half of each.
 */

/** A page's sections: a service, or the About singleton. */
export type SectionTarget = { page: "service"; serviceId: string } | { page: "about" };

function whereTarget(target: SectionTarget) {
  return target.page === "service"
    ? and(eq(contentSections.page, "service"), eq(contentSections.serviceId, target.serviceId))
    : and(eq(contentSections.page, "about"), isNull(contentSections.serviceId));
}

async function selectSections(target: SectionTarget): Promise<Section[]> {
  const rows = await db()
    .select({ kind: contentSections.kind, data: contentSections.data })
    .from(contentSections)
    .where(whereTarget(target))
    .orderBy(asc(contentSections.order), asc(contentSections.createdAt));

  return rows.flatMap((row) => {
    const parsed = sectionSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

const cachedServiceSections = cachedRead(
  async (serviceId: string) => selectSections({ page: "service", serviceId }),
  ["sections", "service"],
  [CACHE_TAGS.services],
);

const cachedAboutSections = cachedRead(
  async () => selectSections({ page: "about" }),
  ["sections", "about"],
  [CACHE_TAGS.about],
);

/** A service page's sections, in order. Cached under the `services` tag. */
export function getServiceSectionRows(serviceId: string): Promise<Section[]> {
  return cachedServiceSections(serviceId);
}

/** The About page's sections, in order. Cached under the `about` tag. */
export function getAboutSectionRows(): Promise<Section[]> {
  return cachedAboutSections();
}

/** Uncached, for the layout editor: it must show the last save, not the cache. */
export function getSectionsForEditor(target: SectionTarget): Promise<Section[]> {
  return selectSections(target);
}

/** Replace a page's sections with `sections`, in that order, atomically. */
export async function replaceSections(
  target: SectionTarget,
  sections: readonly Section[],
): Promise<void> {
  await dbTx().transaction(async (tx) => {
    await tx.delete(contentSections).where(whereTarget(target));
    if (sections.length === 0) return;
    await tx.insert(contentSections).values(
      sections.map((section, index) => ({
        page: target.page,
        serviceId: target.page === "service" ? target.serviceId : null,
        kind: section.kind,
        order: index,
        data: section.data as Record<string, unknown>,
      })),
    );
  });
}
