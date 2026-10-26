import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { testimonials, type Testimonial } from "@/lib/db/schema";

import { CACHE_TAGS, cachedRead, type ReadOptions } from "./shared";

/**
 * Public testimonials additionally require recorded consent.
 *
 * `published` alone is not enough: a testimonial is a real patient's words and
 * likeness, and master spec §6 only permits real names and photos "where
 * consented". Without a consent record the row stays invisible rather than
 * shipping on an assumption.
 *
 * ## Why draft mode does not lift the consent check
 *
 * `options.draft` drops `published`, and nothing else. Consent is not an
 * editorial state an editor is previewing their way towards — it is a recorded
 * fact about a real patient (CLAUDE.md, conversion baseline item 9). Rendering
 * an unconsented quote on a real URL, even behind a preview cookie, publishes
 * it to everyone that URL is then shared with. An editor who needs to see how a
 * quote will look must record the consent first, which is the point.
 */
function consented(options: ReadOptions) {
  return and(
    options.draft ? undefined : eq(testimonials.published, true),
    isNull(testimonials.deletedAt),
    eq(testimonials.consentGiven, true),
  );
}

function selectFeatured(
  limit: number,
  options: ReadOptions,
): Promise<Testimonial[]> {
  return db()
    .select()
    .from(testimonials)
    .where(and(consented(options), eq(testimonials.featured, true)))
    .orderBy(asc(testimonials.order))
    .limit(limit);
}

/** How many featured testimonials the homepage shows (spec §6). */
export const HOMEPAGE_TESTIMONIAL_LIMIT = 2;

/** Featured, consented testimonials, capped at `limit`. */
export async function getFeaturedTestimonials(
  limit = HOMEPAGE_TESTIMONIAL_LIMIT,
  options: ReadOptions = {},
): Promise<Testimonial[]> {
  if (options.draft) return selectFeatured(limit, options);

  const read = cachedRead(
    async (n: number) => selectFeatured(n, {}),
    ["testimonials", "featured"],
    [CACHE_TAGS.testimonials],
  );
  return read(limit);
}

/**
 * Ids of the testimonials the homepage would show right now, in order — the
 * same rule as `getFeaturedTestimonials`, uncached.
 *
 * For the admin editor's "Where it appears" panel, which must say what is true
 * after the last save, not what the public cache held an hour ago.
 */
export async function getHomepageTestimonialIds(): Promise<string[]> {
  const rows = await selectFeatured(HOMEPAGE_TESTIMONIAL_LIMIT, {});
  return rows.map((row) => row.id);
}

/** Consented testimonials attached to one service. */
export async function getTestimonialsByService(
  serviceId: string,
  options: ReadOptions = {},
): Promise<Testimonial[]> {
  return db()
    .select()
    .from(testimonials)
    .where(and(consented(options), eq(testimonials.serviceId, serviceId)))
    .orderBy(asc(testimonials.order));
}

function selectTestimonials(options: ReadOptions): Promise<Testimonial[]> {
  return db()
    .select()
    .from(testimonials)
    .where(consented(options))
    .orderBy(asc(testimonials.order));
}

const cachedTestimonials = cachedRead(
  async (): Promise<Testimonial[]> => selectTestimonials({}),
  ["testimonials", "published"],
  [CACHE_TAGS.testimonials],
);

/** All consented testimonials, in display order. */
export async function getPublishedTestimonials(
  options: ReadOptions = {},
): Promise<Testimonial[]> {
  return options.draft ? selectTestimonials(options) : cachedTestimonials();
}
