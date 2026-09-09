import type { Metadata } from "next";

import { BookingWizard } from "@/components/booking/booking-wizard";
import type {
  BranchOption,
  HmoOption,
  ServiceOption,
} from "@/components/booking/types";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { getHmos, getLocations, getServices } from "@/lib/content";
import { clientEnv } from "@/lib/env";
import {
  describeDay,
  hasPublishedHours,
  todayInLagos,
} from "@/lib/locations/hours-display";
import { RESPONSE_TIME_PROMISE } from "@/lib/response-time";
import { resolveBookingPrefill } from "@/lib/booking/submit";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";

const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

const description =
  "Request an appointment at Paelon Memorial Hospital. Choose a branch, a service and a day that suits you, and we will call to confirm.";

export const metadata: Metadata = {
  title: "Book an appointment",
  description,
  alternates: { canonical: "/book" },
  openGraph: {
    type: "website",
    url: new URL("/book", siteUrl).toString(),
    siteName: "Paelon Memorial Hospital",
    title: "Book an appointment | Paelon Memorial Hospital",
    description,
    images: OG_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Book an appointment | Paelon Memorial Hospital",
    description,
    images: TWITTER_IMAGES,
  },
};

/**
 * `/book` (master spec §6, §7) — the priority conversion path.
 *
 * A server component that does the data work and hands the wizard plain,
 * serialisable options. Deliberately no `getLocations()` rows in the client
 * bundle: the wizard needs a name, a city and a line of hours, not a database
 * record, and `lib/content` values must never cross into a client component.
 *
 * `?branch=` and `?service=` are resolved here rather than in the browser, so
 * a deep link renders the right starting step in the first HTML response
 * instead of flashing step 1 and then jumping.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const [locations, services, hmos] = await Promise.all([
    getLocations(),
    getServices(),
    getHmos(),
  ]);

  const prefill = await resolveBookingPrefill({
    branch: firstParam(params.branch),
    service: firstParam(params.service),
  });

  const today = todayInLagos();

  const branches: BranchOption[] = locations.map((location) => ({
    slug: location.slug,
    name: location.name,
    city: location.city,
    // TODO(seed): no branch has `hours` yet, so this is null everywhere today
    // and the card says so rather than inventing a schedule (seed/README.md).
    hoursToday: hasPublishedHours(location.hours)
      ? describeDay(location.hours[today])
      : null,
  }));

  const serviceOptions: ServiceOption[] = services.map((service) => ({
    slug: service.slug,
    name: service.name,
    family: service.family,
    shortDescription: service.short_description,
  }));

  const hmoOptions: HmoOption[] = hmos.map((hmo) => ({
    slug: hmo.slug,
    name: hmo.name,
    ...(hmo.aliases ? { aliases: hmo.aliases } : {}),
  }));

  return (
    <div className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-25 lg:py-16">
      <Breadcrumbs trail={[{ label: "Book an appointment" }]} />

      <div className="mx-auto mt-8 max-w-3xl">
        <h1 className="text-4xl font-bold uppercase text-primary lg:text-5xl">
          Book an appointment
        </h1>
        <p className="mt-4 text-lg">
          Tell us where, what and when, and we will call to confirm a time.{" "}
          {RESPONSE_TIME_PROMISE}
        </p>
        {/* An emergency must never be routed through a six-step form. */}
        <p className="mt-4 rounded-xl border border-accent/40 bg-surface p-4 text-base">
          If this is an emergency, do not use this form. Go to your nearest
          branch or call the emergency line — it is answered 24 hours a day.
        </p>
      </div>

      <div className="mt-10">
        <BookingWizard
          branches={branches}
          services={serviceOptions}
          hmos={hmoOptions}
          prefill={{
            ...(prefill.locationSlug
              ? { locationSlug: prefill.locationSlug }
              : {}),
            ...(prefill.serviceSlug ? { serviceSlug: prefill.serviceSlug } : {}),
            ...(prefill.serviceFamily
              ? { serviceFamily: prefill.serviceFamily as ServiceOption["family"] }
              : {}),
          }}
        />
      </div>
    </div>
  );
}

/** A repeated query parameter is a malformed link, not two answers. */
function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
