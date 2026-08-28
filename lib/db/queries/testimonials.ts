import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { testimonials, type Testimonial } from "@/lib/db/schema";

import { CACHE_TAGS, cachedRead } from "./shared";

/**
 * Public testimonials additionally require recorded consent.
 *
 * `published` alone is not enough: a testimonial is a real patient's words and
 * likeness, and master spec §6 only permits real names and photos "where
 * consented". Without a consent record the row stays invisible rather than
 * shipping on an assumption.
 */
function consentedPublic() {
  return and(
    eq(testimonials.published, true),
    isNull(testimonials.deletedAt),
    eq(testimonials.consentGiven, true),
  );
}

/** Featured, consented testimonials, capped at `limit`. */
export async function getFeaturedTestimonials(
  limit = 2,
): Promise<Testimonial[]> {
  const read = cachedRead(
    async (n: number) =>
      db()
        .select()
        .from(testimonials)
        .where(and(consentedPublic(), eq(testimonials.featured, true)))
        .orderBy(asc(testimonials.order))
        .limit(n),
    ["testimonials", "featured"],
    [CACHE_TAGS.testimonials],
  );
  return read(limit);
}

/** Consented testimonials attached to one service. */
export async function getTestimonialsByService(
  serviceId: string,
): Promise<Testimonial[]> {
  return db()
    .select()
    .from(testimonials)
    .where(and(consentedPublic(), eq(testimonials.serviceId, serviceId)))
    .orderBy(asc(testimonials.order));
}

/** All consented testimonials, in display order. */
export const getPublishedTestimonials = cachedRead(
  async (): Promise<Testimonial[]> =>
    db()
      .select()
      .from(testimonials)
      .where(consentedPublic())
      .orderBy(asc(testimonials.order)),
  ["testimonials", "published"],
  [CACHE_TAGS.testimonials],
);
