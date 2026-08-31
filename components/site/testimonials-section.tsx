import { SiteImage } from "@/components/site/site-image";
import { getFeaturedTestimonials } from "@/lib/content";

/**
 * Patient testimonials. Static — no carousel, no auto-advance (spec §6).
 *
 * TODO(seed): spec §6 asks for two. The Figma export appears to show two, but
 * both carry the same name and the identical quote with different photos —
 * a duplication artifact, not distinct content. Only the one real testimonial
 * is seeded, so only one renders. A second needs a real name, quote, and
 * consent record from Francis. See seed/README.md.
 */
export function TestimonialsSection() {
  const testimonials = getFeaturedTestimonials();
  if (testimonials.length === 0) return null;

  return (
    <section
      aria-labelledby="testimonials-heading"
      className="bg-background py-16 lg:py-24"
    >
      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-25">
        <h2
          id="testimonials-heading"
          className="text-center text-3xl text-primary lg:text-4xl"
        >
          Warmth in Every Journey
        </h2>

        <ul className="mt-12 grid gap-8 lg:grid-cols-2">
          {testimonials.map((testimonial) => (
            <li key={testimonial.id}>
              <figure className="flex h-full flex-col gap-8 rounded-xl bg-surface p-8 lg:p-12">
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
                      {testimonial.patient_name}
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
      </div>
    </section>
  );
}
