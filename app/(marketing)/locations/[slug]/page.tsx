import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  BranchArrivalRail,
  type ArrivalCell,
} from "@/components/site/branch-arrival-rail";
import { BranchHours } from "@/components/site/branch-hours";
import { BranchMap } from "@/components/site/branch-map";
import { PendingNote } from "@/components/site/pending-note";
import { Button } from "@/components/ui/button";
import {
  formatAddress,
  getLocationBySlug,
  getLocations,
  toDirectionsHref,
  toTelHref,
  toWhatsAppHref,
} from "@/lib/content";
import { clientEnv } from "@/lib/env";
import { toOpeningHoursSpecification } from "@/lib/locations/hours-display";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";

const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Every published branch is known at build time in Phase 1. */
export function generateStaticParams() {
  return getLocations().map((location) => ({ slug: location.slug }));
}

/** Matches the index: today's hours must not freeze at build time. */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const location = getLocationBySlug(slug);

  if (!location) return { title: "Branch not found" };

  const description = `Address, phone number, opening hours and directions for Paelon Memorial Hospital ${location.name}, ${location.city}.`;
  const url = new URL(`/locations/${location.slug}`, siteUrl).toString();

  return {
    title: `${location.name} branch`,
    description,
    alternates: { canonical: `/locations/${location.slug}` },
    openGraph: {
      type: "website",
      url,
      siteName: "Paelon Memorial Hospital",
      title: `${location.name} branch | Paelon Memorial Hospital`,
      description,
      images: OG_IMAGES,
    },
    twitter: {
      card: "summary_large_image",
      title: `${location.name} branch | Paelon Memorial Hospital`,
      description,
      images: TWITTER_IMAGES,
    },
  };
}

export default async function LocationDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const location = getLocationBySlug(slug);

  if (!location) notFound();

  const address = formatAddress(location);
  const url = new URL(`/locations/${location.slug}`, siteUrl).toString();
  const openingHours = toOpeningHoursSpecification(location.hours);

  const whatsappHref = toWhatsAppHref(
    location.whatsapp,
    `Hello Paelon Memorial Hospital, I have a question about the ${location.name} branch.`,
  );

  const cells: ArrivalCell[] = [
    { label: "Call", value: location.phone, href: toTelHref(location.phone) },
    // TODO(seed): no branch WhatsApp number is seeded, and the provider is
    // still open (spec §18). The cell appears the moment a number lands rather
    // than shipping a dead "not available" tile.
    ...(whatsappHref
      ? [
          {
            label: "WhatsApp",
            value: "Message the branch",
            href: whatsappHref,
            external: true,
          } satisfies ArrivalCell,
        ]
      : []),
    {
      label: "Emergency",
      value: location.emergency_line,
      href: toTelHref(location.emergency_line),
      emergency: true,
    },
    {
      label: "Directions",
      value: "Open in maps",
      href: toDirectionsHref(location),
      external: true,
    },
  ];

  /**
   * `Hospital` JSON-LD (spec §11).
   *
   * Every optional property is omitted rather than guessed. `geo` needs
   * coordinates and `openingHoursSpecification` needs a confirmed schedule;
   * neither is seeded, and invalid structured data is worse than absent
   * structured data.
   */
  const hospitalLd = {
    "@context": "https://schema.org",
    "@type": "Hospital",
    name: `Paelon Memorial Hospital, ${location.name}`,
    url,
    telephone: location.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: [location.address_line_1, location.address_line_2]
        .filter(Boolean)
        .join(", "),
      addressLocality: location.city,
      addressRegion: location.state,
      addressCountry: location.country,
    },
    parentOrganization: {
      "@type": "MedicalOrganization",
      name: "Paelon Memorial Hospital",
      url: siteUrl,
    },
    ...(location.latitude && location.longitude
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: location.latitude,
            longitude: location.longitude,
          },
        }
      : {}),
    ...(openingHours.length > 0
      ? { openingHoursSpecification: openingHours }
      : {}),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      {
        "@type": "ListItem",
        position: 2,
        name: "Branches",
        item: new URL("/locations", siteUrl).toString(),
      },
      { "@type": "ListItem", position: 3, name: location.name, item: url },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised from literals above, so there is no untrusted input here.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([hospitalLd, breadcrumbLd]),
        }}
      />

      {/* The signage band. Branch name is uppercased in CSS, not in the
          content, so the accessible name stays "Victoria Island". */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-360 px-4 py-12 sm:px-6 lg:px-25 lg:py-16">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-primary-foreground/70">
              <li>
                <Link
                  href="/locations"
                  className="rounded-md underline-offset-4 hover:underline"
                >
                  Branches
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRight className="size-4" />
              </li>
              <li aria-current="page">{location.name}</li>
            </ol>
          </nav>

          <h1 className="mt-6 text-4xl font-bold uppercase tracking-[0.06em] lg:text-6xl">
            {location.name}
          </h1>

          <address className="mt-5 max-w-2xl text-lg not-italic leading-relaxed text-primary-foreground/85 lg:text-xl">
            {address}
          </address>

          {/*
            One primary CTA (spec §6). Cream on navy rather than the maroon
            accent: maroon against navy is 1.7:1, which fails the 3:1 floor for
            a control boundary. The deep link pre-fills and skips step 1 of the
            booking flow (spec §7).
          */}
          <Button
            asChild
            size="pill"
            className="mt-9 w-full bg-surface text-primary hover:bg-surface/90 sm:w-auto"
          >
            <Link href={`/book?branch=${location.slug}`}>
              Book at this branch
            </Link>
          </Button>
        </div>
      </section>

      {/* Welded to the band above and held to the same gutter as the heading,
          so the rail reads as the row of signs over the reception desk rather
          than a strip that missed the page grid. */}
      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-25">
        <BranchArrivalRail
          cells={cells}
          label={`${location.name} contact and directions`}
        />
      </div>

      {/* The reading column starts at the page gutter rather than centring
          itself, so body copy lines up under the branch name. */}
      <div className="mx-auto max-w-360 px-4 py-14 sm:px-6 lg:px-25 lg:py-20">
        <div className="max-w-3xl">
        <section aria-labelledby="hours-heading">
          <h2 id="hours-heading" className="text-2xl text-primary lg:text-3xl">
            Opening hours
          </h2>
          <div className="mt-6">
            <BranchHours
              hours={location.hours}
              phone={location.phone}
              branchName={location.name}
            />
          </div>
        </section>

        <section aria-labelledby="services-heading" className="mt-14">
          <h2
            id="services-heading"
            className="text-2xl text-primary lg:text-3xl"
          >
            Services at this branch
          </h2>
          <div className="mt-6">
            {/* TODO(seed): services.json still carries `branch_ids: []` rather
                than `location_slugs`, so nothing maps a service to a branch.
                Listing the full service catalogue here would claim every
                service runs at every branch, which nobody has confirmed. */}
            <PendingNote
              action={
                <Link
                  href="/services"
                  className="rounded-md text-sm font-medium text-accent underline underline-offset-4"
                >
                  Browse all services
                </Link>
              }
            >
              Which services run at this branch has not been confirmed. Call the
              branch to check before you travel for a specific appointment.
            </PendingNote>
          </div>
        </section>

        <section aria-labelledby="getting-here-heading" className="mt-14">
          <h2
            id="getting-here-heading"
            className="text-2xl text-primary lg:text-3xl"
          >
            Getting here
          </h2>

          <div className="mt-6">
            <BranchMap location={location} />
          </div>

          {/* TODO(seed): parking_info and accessibility_notes are null on every
              row. Accessibility in particular is a promise a wheelchair user
              would act on, so it is never inferred. */}
          {location.parking_info ? (
            <div className="mt-8">
              <h3 className="text-lg font-medium text-primary">Parking</h3>
              <p className="mt-2 text-base leading-relaxed">
                {location.parking_info}
              </p>
            </div>
          ) : null}

          {location.accessibility_notes ? (
            <div className="mt-8">
              <h3 className="text-lg font-medium text-primary">
                Accessibility
              </h3>
              <p className="mt-2 text-base leading-relaxed">
                {location.accessibility_notes}
              </p>
            </div>
          ) : null}

          {!location.parking_info && !location.accessibility_notes ? (
            <PendingNote
              className="mt-8"
              action={
                <a
                  href={toTelHref(location.phone)}
                  className="rounded-md text-sm font-medium text-accent underline underline-offset-4"
                >
                  Call {location.phone}
                </a>
              }
            >
              Parking and step-free access details for this branch have not been
              confirmed. Call ahead if you need to know what to expect on
              arrival.
            </PendingNote>
          ) : null}
        </section>
        </div>
      </div>
    </>
  );
}
