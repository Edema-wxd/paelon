import { Phone } from "lucide-react";
import Link from "next/link";

import type { Destination } from "@/components/site/wayfinding-board";
import { WayfindingBoard } from "@/components/site/wayfinding-board";
import { Button } from "@/components/ui/button";
import type { ServiceFamily } from "@/lib/content";
import {
  getLocations,
  getPrimaryLocation,
  getServices,
  toTelHref,
} from "@/lib/content";

/**
 * The 404 body (spec §6: on-brand, emergency line prominent, search bar
 * linking to services / locations, link back to the homepage).
 *
 * Shared by the root `app/not-found.tsx`, which catches unmatched URLs, and
 * `app/(marketing)/not-found.tsx`, which catches `notFound()` calls from inside
 * a marketing route. The root copy has to supply its own header and footer:
 * Next renders it inside `app/layout.tsx` only, so a route-group layout never
 * applies to a URL that matched no route.
 *
 * Held to the brand tokens throughout. No new colour and no second typeface are
 * introduced here — spec §4 is still an unconfirmed placeholder block, and a
 * 404 is not the page to guess a palette on.
 */

const FAMILY_LABELS: Record<ServiceFamily, string> = {
  family_healthcare: "Family healthcare",
  women_and_children: "Women and children",
  specialist: "Specialist",
  diagnostics: "Diagnostics",
};

/**
 * Build the directory from seed data plus the fixed templates in spec §3.
 *
 * Every entry points at a route that exists in the spec's directory tree. The
 * `meta` string is real content — a service's family, a branch's city — never
 * an invented description, so the search has something honest to match on.
 */
async function getDestinations(): Promise<Destination[]> {
  const services: Destination[] = (await getServices()).map((service) => ({
    href: `/services/${service.slug}`,
    label: service.name,
    meta: FAMILY_LABELS[service.family],
  }));

  // Branches are usually named after the district they sit in, so "Branch,
  // Victoria Island" under a row labelled "Victoria Island" says nothing. The
  // city is only worth the space when it differs from the name.
  const branches: Destination[] = (await getLocations()).map((location) => ({
    href: `/locations/${location.slug}`,
    label: location.name,
    meta:
      location.city === location.name ? "Branch" : `Branch, ${location.city}`,
  }));

  return [
    ...services,
    // Sits directly under the seeded services so it reads as "and the rest",
    // which is where a visitor who 404'd on an unseeded service slug lands.
    { href: "/services", label: "All medical services", meta: "Overview" },
    ...branches,
    { href: "/book", label: "Book an appointment", meta: "Appointments" },
    { href: "/contact", label: "Contact us", meta: "Enquiries" },
    { href: "/about", label: "About Paelon", meta: "The hospital" },
    { href: "/blog", label: "Health articles", meta: "Reading" },
    {
      href: "/for-corporates",
      label: "Corporate health plans",
      meta: "Employers",
    },
  ];
}

export async function NotFoundContent() {
  const location = await getPrimaryLocation();
  const destinations = await getDestinations();

  const telHref = location ? toTelHref(location.emergency_line) : null;

  return (
    <div className="mx-auto max-w-360 px-4 py-16 sm:px-6 lg:px-25 lg:py-24">
      <p className="text-sm font-medium tracking-[0.2em] text-accent uppercase">
        Error 404
      </p>

      <h1 className="mt-4 max-w-3xl text-4xl font-bold text-primary lg:text-5xl">
        The page you asked for is not here.
      </h1>

      {/*
        The reassurance is the point of this paragraph. A hospital 404 is read
        by people who wonder whether they broke something, so it answers that
        before it explains anything else. It claims nothing beyond what is true:
        a missing page does not touch the bookings table.
      */}
      <p className="mt-6 max-w-2xl text-lg text-foreground/80 lg:text-xl">
        The link may be out of date, or the address may have a typo. Any
        appointment you have already booked is not affected.
      </p>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
        {/*
          Declared first so it reads first on mobile and to a screen reader.
          The directory below runs to a dozen rows; nobody who needs this number
          should have to scroll past them. Explicit grid placement moves it to
          the right rail on desktop without an order hack.
        */}
        {location && telHref ? (
          <aside
            aria-labelledby="emergency-heading"
            className="rounded-xl bg-accent p-6 text-accent-foreground lg:col-start-2 lg:row-start-1 lg:sticky lg:top-28 lg:self-start"
          >
            <h2 id="emergency-heading" className="text-xl font-medium">
              Emergency
            </h2>
            <p className="mt-2 text-base text-accent-foreground/85">
              Our line is open 24 hours, every day.
            </p>

            {/*
              The largest number on this page is the emergency line, not the
              status code. That is the whole hierarchy decision here.

              TODO(seed): +234 1234 5678 comes from the Figma export and reads
              as a placeholder, same as the footer. A wrong emergency number on
              a hospital site is a safety issue, not a snag. Confirm before
              launch.
            */}
            <a
              href={telHref}
              className="mt-5 block rounded-md text-3xl font-bold underline-offset-4 hover:underline"
            >
              {location.emergency_line}
            </a>

            <Button
              asChild
              variant="secondary"
              className="mt-6 h-12 w-full rounded-full text-base"
            >
              <a href={telHref}>
                <Phone aria-hidden />
                Call now
              </a>
            </Button>

            <address className="mt-6 border-t border-accent-foreground/25 pt-6 text-base not-italic text-accent-foreground/85">
              {location.address_line_1}
              <br />
              {location.city}, {location.state}
            </address>
          </aside>
        ) : null}

        <div className="lg:col-start-1 lg:row-start-1">
          <WayfindingBoard
            destinations={destinations}
            emergencyPhone={location?.emergency_line ?? null}
            emergencyTelHref={telHref}
          />

          <Button asChild size="pill" className="mt-10 w-full sm:w-auto">
            <Link href="/">Back to homepage</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
