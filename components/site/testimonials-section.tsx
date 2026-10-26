import { Star } from "lucide-react";

import { SiteImage } from "@/components/site/site-image";
import { getFeaturedTestimonials } from "@/lib/content";
import { getGoogleReviews, type GoogleReviews } from "@/lib/google-reviews";

/**
 * Patient testimonials. Static — no carousel, no auto-advance (spec §6).
 *
 * TODO(seed): spec §6 asks for two. The Figma export appears to show two, but
 * both carry the same name and the identical quote with different photos —
 * a duplication artifact, not distinct content. Only the one real testimonial
 * is seeded, so only one renders. A second needs a real name, quote, and
 * consent record from Francis. See seed/README.md.
 */
export async function TestimonialsSection() {
  const [testimonials, google] = await Promise.all([
    getFeaturedTestimonials(),
    getGoogleReviews(),
  ]);
  const hasGoogle = google !== null && google.reviews.length > 0;
  if (testimonials.length === 0 && !hasGoogle) return null;

  return (
    <section
      aria-labelledby="testimonials-heading"
      className="bg-surface py-16 lg:py-24"
    >
      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-25">
        <h2
          id="testimonials-heading"
          className="text-center text-3xl text-primary lg:text-4xl"
        >
          Warmth in Every Journey
        </h2>

        {testimonials.length > 0 ? (
          <>
            {/*
              Only one testimonial is seeded, and a lone card in a two-column grid
              left ~700px of empty ground beside it on a desktop screen, which reads
              as a card that failed to load rather than as a deliberate single
              quote. One quote gets a centred, measure-limited column instead; the
              grid comes back on its own as soon as a second is seeded.
            */}
            <ul
              className={
                testimonials.length === 1
                  ? "mx-auto mt-12 grid max-w-2xl gap-8"
                  : "mt-12 grid gap-8 lg:grid-cols-2"
              }
            >
              {testimonials.map((testimonial) => (
                <li key={testimonial.id}>
                  <figure className="flex h-full flex-col gap-8 rounded-xl bg-secondary p-8 lg:p-12">
                    <div className="flex items-center gap-6">
                      {/* TODO(asset): patient photographs were not delivered, and
                          spec §6 only permits them "where consented" — no consent
                          record was supplied either. */}
                      <SiteImage
                        kind="portrait"
                        name={testimonial.slug}
                        alt=""
                        className="size-25 shrink-0 rounded-full object-cover"
                      />
                      <figcaption>
                        <p className="text-base font-medium">
                          {/* Already reduced to what the patient agreed to show. */}
                          {testimonial.display_name}
                        </p>
                        {/* TODO(seed): the export labels this "New Mother". No
                            structured field exists for it in the spec §5
                            testimonials schema, so it is not rendered rather than
                            being hardcoded. */}
                      </figcaption>
                    </div>

                    <blockquote className="text-base leading-relaxed">
                      <p>&ldquo;{testimonial.quote}&rdquo;</p>
                    </blockquote>
                  </figure>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {hasGoogle ? (
          <GoogleReviewList google={google} first={testimonials.length === 0} />
        ) : null}
      </div>
    </section>
  );
}

/**
 * Five-star reviews from the hospital's Google listing, shown as Google's.
 *
 * Kept visibly apart from the testimonials above — its own heading, its own
 * attribution — because they are a different thing: a testimonial is a quote
 * Paelon holds with the patient's consent, a Google review is what someone
 * published on Google (`lib/google-reviews.ts`). Reviews are shown whole and
 * unedited; Google chooses which ones the API returns.
 */
function GoogleReviewList({ google, first }: { google: GoogleReviews; first: boolean }) {
  return (
    <div className={first ? "mt-12" : "mt-16"}>
      <h3 className="text-center text-2xl text-primary">Reviews on Google</h3>
      {google.rating !== null && google.count !== null ? (
        <p className="mt-3 text-center text-base text-foreground/80">
          Rated {google.rating.toFixed(1)} out of 5 from{" "}
          {google.count.toLocaleString("en-NG")} reviews on Google.
        </p>
      ) : null}

      <ul className="mt-10 grid gap-6 lg:grid-cols-2">
        {google.reviews.map((review, index) => (
          <li key={`${review.author}-${review.publishTime ?? index}`}>
            <figure className="flex h-full flex-col gap-4 rounded-xl border border-border bg-background p-6 lg:p-8">
              <p className="flex items-center gap-0.5 text-amber-600">
                {[0, 1, 2, 3, 4].map((star) => (
                  <Star key={star} aria-hidden className="size-4 fill-current" />
                ))}
                <span className="sr-only">5 out of 5 stars</span>
              </p>
              <blockquote className="text-base leading-relaxed whitespace-pre-line">
                <p>{review.text}</p>
              </blockquote>
              <figcaption className="mt-auto text-sm text-muted-foreground">
                {review.authorUrl ? (
                  <a
                    href={review.authorUrl}
                    rel="nofollow noopener ugc"
                    className="font-medium text-primary underline underline-offset-4 hover:no-underline"
                  >
                    {review.author}
                  </a>
                ) : (
                  <span className="font-medium text-primary">{review.author}</span>
                )}
                {review.when ? (
                  <>
                    {" · "}
                    {review.publishTime ? (
                      <time dateTime={review.publishTime}>{review.when}</time>
                    ) : (
                      review.when
                    )}
                  </>
                ) : null}
                {" · on Google"}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      {google.mapsUrl ? (
        <p className="mt-8 text-center text-base">
          <a
            href={google.mapsUrl}
            rel="noopener"
            className="font-medium text-accent underline underline-offset-4 hover:no-underline"
          >
            Read all reviews of Paelon Memorial Hospital on Google Maps
          </a>
        </p>
      ) : null}
    </div>
  );
}
