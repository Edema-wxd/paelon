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

/** Featured, consented testimonials, capped at `limit`. */
export async function getFeaturedTestimonials(
  limit = 2,
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
