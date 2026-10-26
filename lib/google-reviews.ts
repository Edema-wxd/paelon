import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Five-star Google reviews of the hospital, read live from the Places API (New).
 *
 * ## Why these are not testimonials
 *
 * CLAUDE.md baseline item 9: a testimonial is a patient quote Paelon holds with
 * recorded consent, in the `testimonials` table. A Google review is neither —
 * it is something the reviewer published on Google, shown here *as Google's*:
 * attributed to its author with a link to their review, labelled "Reviews on
 * Google", never stored, never edited, never trimmed. Francis chose this on
 * 2026-10-26 over copying reviews into the testimonials table, which would need
 * each reviewer's consent and break Google's terms besides.
 *
 * ## What Google's terms ask of this code
 *
 *  - **No scraping, no stored copies.** The reviews come from Google's API on
 *    each revalidation and live only in Next's fetch cache, refreshed every six
 *    hours; nothing is written to the database or to `seed/`.
 *  - **Attribution.** Each review shows its author's name, linked to the
 *    author's Google profile when the API gives one, and the section links to
 *    the listing on Google Maps.
 *  - **Google chooses the reviews.** The API returns at most five, picked by
 *    Google. Only the five-star ones with text are shown, so the section can
 *    hold fewer than five, or none — in which case it does not render.
 *
 * Server only: the key never reaches the browser, and there is no third-party
 * script in the page (spec §13).
 */

export interface GoogleReview {
  author: string;
  /** The author's Google profile, for the attribution link. */
  authorUrl: string | null;
  text: string;
  /** Google's own phrasing, "2 months ago". */
  when: string | null;
  /** ISO 8601, for `<time dateTime>`. */
  publishTime: string | null;
}

export interface GoogleReviews {
  /** The listing's overall rating, 1–5, as Google reports it. */
  rating: number | null;
  /** How many reviews that rating is drawn from. */
  count: number | null;
  /** The listing on Google Maps, for the section's attribution link. */
  mapsUrl: string | null;
  reviews: GoogleReview[];
}

/** How long Google's answer is reused before it is asked again. */
export const GOOGLE_REVIEWS_REVALIDATE_SECONDS = 6 * 60 * 60;

/** The Places API (New) response, as far as this reads it. Everything optional. */
const placeSchema = z.object({
  rating: z.number().optional(),
  userRatingCount: z.number().int().optional(),
  googleMapsUri: z.url().optional(),
  reviews: z
    .array(
      z.object({
        rating: z.number().optional(),
        text: z.object({ text: z.string() }).optional(),
        originalText: z.object({ text: z.string() }).optional(),
        relativePublishTimeDescription: z.string().optional(),
        publishTime: z.string().optional(),
        authorAttribution: z
          .object({ displayName: z.string().optional(), uri: z.url().optional() })
          .optional(),
      }),
    )
    .optional(),
});

type Place = z.output<typeof placeSchema>;

/**
 * Keep the five-star reviews that have something to read, in Google's order.
 *
 * The original text is preferred over Google's translation, so a review reads
 * as its author wrote it. A review with no author name is dropped: attribution
 * is the condition for showing it at all.
 */
export function toGoogleReviews(place: Place): GoogleReviews {
  const reviews: GoogleReview[] = [];
  for (const review of place.reviews ?? []) {
    if (review.rating !== 5) continue;
    const text = (review.originalText?.text ?? review.text?.text ?? "").trim();
    const author = review.authorAttribution?.displayName?.trim() ?? "";
    if (text === "" || author === "") continue;
    reviews.push({
      author,
      authorUrl: review.authorAttribution?.uri ?? null,
      text,
      when: review.relativePublishTimeDescription ?? null,
      publishTime: review.publishTime ?? null,
    });
  }

  return {
    rating: place.rating ?? null,
    count: place.userRatingCount ?? null,
    mapsUrl: place.googleMapsUri ?? null,
    reviews,
  };
}

/**
 * The hospital's five-star Google reviews, or null when unconfigured or when
 * Google cannot be reached.
 *
 * Null is quiet on the page — the section simply does not render — but logged,
 * so a revoked key or a quota error is visible in the logs rather than
 * looking like a hospital with no reviews.
 */
export async function getGoogleReviews(): Promise<GoogleReviews | null> {
  const { GOOGLE_PLACES_API_KEY: key, GOOGLE_PLACE_ID: placeId } = serverEnv();
  if (!key || !placeId) return null;

  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri,reviews",
        },
        next: { revalidate: GOOGLE_REVIEWS_REVALIDATE_SECONDS, tags: ["google-reviews"] },
      },
    );

    if (!response.ok) {
      logger.warn("google_reviews.request_failed", { status: response.status });
      return null;
    }

    const parsed = placeSchema.safeParse(await response.json());
    if (!parsed.success) {
      logger.warn("google_reviews.unexpected_shape", { issues: parsed.error.issues.length });
      return null;
    }

    return toGoogleReviews(parsed.data);
  } catch (error) {
    logger.warn("google_reviews.unreachable", { error });
    return null;
  }
}
