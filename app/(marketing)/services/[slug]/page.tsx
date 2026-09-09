import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { FaqSection } from "@/components/site/faq-section";
import { PendingNote } from "@/components/site/pending-note";
import { SiteImage } from "@/components/site/site-image";
import { Button } from "@/components/ui/button";
import {
  getFaqs,
  getPrimaryLocation,
  getRelatedServices,
  getServiceBySlug,
  getServices,
  toTelHref,
} from "@/lib/content";
import { clientEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";

const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Service detail (spec §6).
 *
 * ## The content situation
 *
 * Everything descriptive about a service — `short_description`, `what_to_expect`,
 * `who_its_for`, `how_to_access`, `typical_wait_time` — is still the `TODO(seed)`
 * sentinel or an empty array in the database. `lib/content.ts` normalises those
 * to null so nothing leaks, and this template renders each block only when real
 * copy exists.
 *
 * That leaves a page with a name, a photo and a way to book, which is a truthful
 * page. The alternative — writing plausible copy about what happens at a
 * fertility clinic — is the exact thing CLAUDE.md forbids, and on a hospital
 * site an invented clinical claim is a real-world harm rather than a
 * placeholder. `PendingNote` marks the gap and hands over a phone number, which
 * is the honest answer to "what happens at this appointment" until Francis
 * supplies the copy.
 */

/** Every published service is known at build time. */
export async function generateStaticParams() {
  try {
    return (await getServices()).map((service) => ({ slug: service.slug }));
  } catch (error) {
    // Matches the blog and locations routes: an unreachable database during a
    // build degrades to on-demand rendering rather than failing the deploy.
    logger.warn("services.static_params_failed", { error });
    return [];
  }
}

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);

  if (!service) return { title: "Service not found" };

  // Falls back to a factual sentence built from the service's own name — not
  // invented copy about what the department does, which is the thing that
  // would need seeding.
  const description =
    service.short_description ??
    `${service.name} at Paelon Memorial Hospital. How the service works, who it is for, and how to book an appointment.`;

  const url = new URL(`/services/${service.slug}`, siteUrl).toString();
  const title = service.name;

  return {
    title,
    description,
    alternates: { canonical: `/services/${service.slug}` },
    openGraph: {
      type: "website",
      url,
      siteName: "Paelon Memorial Hospital",
      title: `${title} | Paelon Memorial Hospital`,
      description,
      images: OG_IMAGES,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Paelon Memorial Hospital`,
      description,
      images: TWITTER_IMAGES,
    },
  };
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);

  if (!service) notFound();

  const [related, faqs, location] = await Promise.all([
    getRelatedServices(service.id),
    getFaqs("services"),
    getPrimaryLocation(),
  ]);

  const url = new URL(`/services/${service.slug}`, siteUrl).toString();

  /**
   * `MedicalProcedure` per spec §11.
   *
   * Carries only what the seed actually holds. `description` is omitted rather
   * than filled with the fallback sentence used for the meta description —
   * structured data is a machine-readable claim about the hospital, and a
   * sentence written to fill a slot is not a claim worth publishing.
   */
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MedicalProcedure",
    name: service.name,
    url,
    provider: {
      "@type": "Hospital",
      name: "Paelon Memorial Hospital",
      url: siteUrl,
    },
    ...(service.short_description
      ? { description: service.short_description }
      : {}),
  };

  const hasDetail =
    service.what_to_expect !== null ||
    service.who_its_for.length > 0 ||
    service.how_to_access.length > 0;

  return (
    <>
      <script
        type="application/ld+json"
        // Built above from seeded values; nothing here is user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-360 px-4 pt-8 sm:px-6 lg:px-25">
        <Breadcrumbs
          trail={[
            { label: "Medical services", href: "/services" },
            { label: service.name },
          ]}
        />
      </div>

      <article>
        <header className="mx-auto max-w-360 px-4 py-12 sm:px-6 lg:px-25 lg:py-16">
          <h1 className="max-w-3xl text-4xl font-bold text-primary lg:text-5xl">
            {service.name}
          </h1>

          {service.short_description ? (
            <p className="mt-6 max-w-2xl text-lg text-foreground/80 lg:text-xl">
              {service.short_description}
            </p>
          ) : null}

          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            {/* Deep link per CLAUDE.md: `?service=` pre-fills step 2 and the
                flow skips it. */}
            <Button asChild size="pill" className="w-full sm:w-auto sm:min-w-50">
              <Link href={`/book?service=${service.slug}`}>
                Book {service.name}
              </Link>
            </Button>
            {location ? (
              <Button
                asChild
                variant="outline"
                size="pill"
                className="w-full sm:w-auto sm:min-w-50"
              >
                <a href={toTelHref(location.phone)}>Call {location.phone}</a>
              </Button>
            ) : null}
          </div>
        </header>

        <div className="relative mx-auto aspect-[16/7] w-full max-w-360 overflow-hidden sm:rounded-xl lg:px-25">
          {/* Decorative: the h1 above already names the service, and the photo
              carries no information the heading does not. */}
          <SiteImage kind="service-card" name={service.slug} alt="" fill />
        </div>

        <div className="mx-auto grid max-w-360 gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16 lg:px-25 lg:py-20">
          <div>
            {hasDetail ? (
              <>
                {service.what_to_expect ? (
                  <section aria-labelledby="what-to-expect">
                    <h2
                      id="what-to-expect"
                      className="text-2xl text-accent lg:text-3xl"
                    >
                      What to expect
                    </h2>
                    <p className="mt-4 max-w-2xl text-base leading-relaxed text-foreground/80">
                      {service.what_to_expect}
                    </p>
                  </section>
                ) : null}

                {service.who_its_for.length > 0 ? (
                  <section aria-labelledby="who-its-for" className="mt-12">
                    <h2
                      id="who-its-for"
                      className="text-2xl text-accent lg:text-3xl"
                    >
                      Who it is for
                    </h2>
                    <ul className="mt-4 max-w-2xl list-disc space-y-2 pl-5 text-base leading-relaxed text-foreground/80">
                      {service.who_its_for.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {service.how_to_access.length > 0 ? (
                  <section aria-labelledby="how-to-access" className="mt-12">
                    <h2
                      id="how-to-access"
                      className="text-2xl text-accent lg:text-3xl"
                    >
                      How to access it
                    </h2>
                    <ol className="mt-4 max-w-2xl list-decimal space-y-2 pl-5 text-base leading-relaxed text-foreground/80">
                      {service.how_to_access.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                  </section>
                ) : null}
              </>
            ) : (
              /*
               * The whole descriptive body is unseeded. Rather than an empty
               * column, the page says so and gives an action that works.
               * TODO(seed): short_description, what_to_expect, who_its_for,
               * how_to_access and typical_wait_time for all five services.
               */
              <PendingNote
                action={
                  location ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={toTelHref(location.phone)}>
                        Call {location.phone}
                      </a>
                    </Button>
                  ) : undefined
                }
              >
                We have not published the details of this service yet. Call us
                and we will tell you what the appointment involves and what to
                bring.
              </PendingNote>
            )}
          </div>

          <aside className="lg:col-start-2 lg:row-start-1">
            {service.typical_wait_time ? (
              <div className="rounded-xl bg-secondary p-6">
                <h2 className="text-lg font-medium text-primary">
                  Typical wait
                </h2>
                <p className="mt-2 text-base text-foreground/80">
                  {service.typical_wait_time}
                </p>
              </div>
            ) : null}

            {related.length > 0 ? (
              <nav aria-labelledby="related-heading" className="mt-8 first:mt-0">
                <h2
                  id="related-heading"
                  className="text-lg font-medium text-primary"
                >
                  Related services
                </h2>
                <ul className="mt-4 space-y-2">
                  {related.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/services/${item.slug}`}
                        className="text-base text-accent underline underline-offset-4 hover:no-underline"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </aside>
        </div>
      </article>

      {/* Renders nothing while the `faqs` table is empty, which it is. */}
      <FaqSection faqs={faqs} headingId="service-faq-heading" />
    </>
  );
}
