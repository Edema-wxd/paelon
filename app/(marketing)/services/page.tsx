import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { PendingNote } from "@/components/site/pending-note";
import { SiteImage } from "@/components/site/site-image";
import { Button } from "@/components/ui/button";
import { getPrimaryLocation, getServices, type ServiceFamily } from "@/lib/content";
import { clientEnv } from "@/lib/env";
import { toTelHref } from "@/lib/content";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";

const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

/**
 * Service index (spec §6).
 *
 * Grouped by `service_family` rather than listed flat, because the families are
 * how the hospital is actually organised and a flat list of five gives a reader
 * no way to tell a department from a clinic.
 *
 * Only names, families and images are seeded today — every description in the
 * `services` table is still the `TODO(seed)` sentinel, which `lib/content.ts`
 * normalises to null. So the cards carry a name and nothing invented.
 */

const description =
  "Departments and clinics at Paelon Memorial Hospital: family healthcare, women and children's health, specialist care and diagnostics.";

export const metadata: Metadata = {
  title: "Medical services",
  description,
  alternates: { canonical: "/services" },
  openGraph: {
    type: "website",
    url: new URL("/services", siteUrl).toString(),
    siteName: "Paelon Memorial Hospital",
    title: "Medical services | Paelon Memorial Hospital",
    description,
    images: OG_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Medical services | Paelon Memorial Hospital",
    description,
    images: TWITTER_IMAGES,
  },
};

/** Matches the other content routes: seeded content, revalidated hourly. */
export const revalidate = 3600;

/**
 * Display order and labels for the families.
 *
 * Declared rather than derived so the page reads in a deliberate order —
 * general care first, specialisms after — instead of alphabetically or in
 * whatever order rows come back.
 */
const FAMILIES: { key: ServiceFamily; label: string }[] = [
  { key: "family_healthcare", label: "Family healthcare" },
  { key: "women_and_children", label: "Women and children" },
  { key: "specialist", label: "Specialist care" },
  { key: "diagnostics", label: "Diagnostics" },
];

export default async function ServicesPage() {
  const [services, location] = await Promise.all([
    getServices(),
    getPrimaryLocation(),
  ]);

  const grouped = FAMILIES.map((family) => ({
    ...family,
    services: services.filter((service) => service.family === family.key),
  })).filter((group) => group.services.length > 0);

  return (
    <>
      <div className="mx-auto max-w-360 px-4 pt-8 sm:px-6 lg:px-25">
        <Breadcrumbs trail={[{ label: "Medical services" }]} />
      </div>

      <section className="mx-auto max-w-360 px-4 py-12 sm:px-6 lg:px-25 lg:py-16">
        <h1 className="max-w-3xl text-4xl font-bold text-primary lg:text-5xl">
          Medical services
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-foreground/80 lg:text-xl">
          Our departments and clinics. Choose one to see how it works and how to
          book, or call us if you are not sure which you need.
        </p>

        {location ? (
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Button asChild size="pill" className="w-full sm:w-auto sm:min-w-50">
              <Link href="/book">Book an appointment</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="pill"
              className="w-full sm:w-auto sm:min-w-50"
            >
              <a href={toTelHref(location.phone)}>Call {location.phone}</a>
            </Button>
          </div>
        ) : null}
      </section>

      {grouped.length === 0 ? (
        <div className="mx-auto max-w-360 px-4 pb-20 sm:px-6 lg:px-25">
          <PendingNote>
            No services are published yet. Call us and we will point you to the
            right department.
          </PendingNote>
        </div>
      ) : null}

      {grouped.map((group) => (
        <section
          key={group.key}
          aria-labelledby={`family-${group.key}`}
          className="border-t border-border py-12 lg:py-16"
        >
          <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-25">
            <h2
              id={`family-${group.key}`}
              className="text-2xl text-accent lg:text-3xl"
            >
              {group.label}
            </h2>

            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {group.services.map((service) => (
                <li key={service.id}>
                  <Link
                    href={`/services/${service.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-xl bg-surface shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="relative h-44 w-full">
                      {/* Decorative: the card's heading below is the link's
                          accessible name, so describing the photo again would
                          announce the destination twice. */}
                      <SiteImage
                        kind="service-card"
                        name={service.slug}
                        alt=""
                        fill
                      />
                    </div>

                    <div className="flex flex-1 flex-col p-6">
                      <h3 className="text-xl text-primary">{service.name}</h3>

                      {/*
                        Rendered only when the seed has real copy. Every row is
                        currently the TODO(seed) sentinel, so nothing prints
                        here — a card with a name is honest, a card with
                        invented blurb is not (CLAUDE.md).
                      */}
                      {service.short_description ? (
                        <p className="mt-3 text-base text-foreground/80">
                          {service.short_description}
                        </p>
                      ) : null}

                      <span className="mt-auto pt-4 text-sm font-medium text-accent underline-offset-4 group-hover:underline">
                        About {service.name}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </>
  );
}
