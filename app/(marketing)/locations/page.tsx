import type { Metadata } from "next";
import Link from "next/link";

import { BranchCard } from "@/components/site/branch-card";
import { BranchMap } from "@/components/site/branch-map";
import { LocationsViewToggle } from "@/components/site/locations-view-toggle";
import { PendingNote } from "@/components/site/pending-note";
import { getLocations } from "@/lib/content";
import { clientEnv } from "@/lib/env";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";

const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: "Branches",
  description:
    "Addresses, phone numbers and directions for every Paelon Memorial Hospital branch in Lagos.",
  alternates: { canonical: "/locations" },
  openGraph: {
    type: "website",
    url: new URL("/locations", siteUrl).toString(),
    siteName: "Paelon Memorial Hospital",
    title: "Branches | Paelon Memorial Hospital",
    description:
      "Addresses, phone numbers and directions for every Paelon Memorial Hospital branch in Lagos.",
    images: OG_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Branches | Paelon Memorial Hospital",
    description:
      "Addresses, phone numbers and directions for every Paelon Memorial Hospital branch in Lagos.",
    images: TWITTER_IMAGES,
  },
};

/**
 * Five minutes, because the branch cards mark today's hours in Africa/Lagos
 * time. Fully static, the day label would freeze at build time and tell a
 * patient the wrong thing. Five minutes caps how long the page can be wrong
 * after midnight in Lagos.
 */
export const revalidate = 300;

export default async function LocationsPage() {
  const locations = await getLocations();

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Branches",
        item: new URL("/locations", siteUrl).toString(),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised from a literal above, so there is no untrusted input here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/*
        A flat navy band rather than a photograph. It gives the locations
        templates their own identity inside the existing palette without
        inventing one, and no branch photography has been delivered (see
        seed/README.md) — a stock hospital exterior would be a picture of a
        building that is not Paelon.
      */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-360 px-4 py-14 sm:px-6 lg:px-25 lg:py-20">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary-foreground/70">
            Branches
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold lg:text-6xl">
            Where to find us
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-primary-foreground/85 lg:text-xl">
            Addresses, phone numbers and directions for every Paelon branch.
            Call a branch directly, or book online and pick your branch as you
            go.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="branch-list-heading"
        className="mx-auto max-w-360 px-4 py-14 sm:px-6 lg:px-25 lg:py-20"
      >
        {locations.length > 0 ? (
          /* The toggle owns the heading row so it can lay the switch out
             beside it; it is the only client component on the page. */
          <LocationsViewToggle
            heading={
              <h2 id="branch-list-heading" className="text-3xl text-primary">
                {locations.length}{" "}
                {locations.length === 1 ? "branch" : "branches"}
              </h2>
            }
            list={
              <ul className="grid gap-8 lg:grid-cols-2">
                {locations.map((location) => (
                  /* A lone branch spans the row rather than sitting in one
                     half of a two-column grid with nothing beside it. The card
                     rearranges itself to suit whichever width it gets. */
                  <li
                    key={location.id}
                    className={locations.length === 1 ? "lg:col-span-2" : ""}
                  >
                    <BranchCard location={location} />
                  </li>
                ))}
              </ul>
            }
            map={
              /* A single map tile stretched across 1240px would be a very tall
                 empty rectangle, so one branch gets a capped column instead of
                 the two-up grid. */
              <ul
                className={`grid gap-8 ${
                  locations.length === 1 ? "max-w-3xl" : "lg:grid-cols-2"
                }`}
              >
                {locations.map((location) => (
                  <li key={location.id}>
                    <h3 className="mb-4 text-xl font-medium uppercase tracking-[0.08em] text-primary">
                      <Link
                        href={`/locations/${location.slug}`}
                        className="rounded-md transition-colors hover:text-accent"
                      >
                        {location.name}
                      </Link>
                    </h3>
                    <BranchMap location={location} />
                  </li>
                ))}
              </ul>
            }
          />
        ) : (
          <h2 id="branch-list-heading" className="text-3xl text-primary">
            Branch directory
          </h2>
        )}

        {locations.length === 0 ? (
          <div className="mt-10 max-w-2xl">
            {/* TODO(seed): only Victoria Island is published. .env.example
                implies four branches. See seed/README.md. */}
            <PendingNote
              action={
                <Link
                  href="/contact"
                  className="rounded-md text-sm font-medium text-accent underline underline-offset-4"
                >
                  Contact us
                </Link>
              }
            >
              No branch details are published yet. Get in touch and we will tell
              you where to come.
            </PendingNote>
          </div>
        ) : null}

        <p className="mt-14 text-base text-muted-foreground">
          Not sure which branch to use?{" "}
          <Link
            href="/contact"
            className="rounded-md font-medium text-accent underline underline-offset-4"
          >
            Get in touch
          </Link>
          .
        </p>
      </section>
    </>
  );
}
