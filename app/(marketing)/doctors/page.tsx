import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { PendingNote } from "@/components/site/pending-note";
import { SpecialistCard } from "@/components/site/specialist-card";
import { Button } from "@/components/ui/button";
import {
  getDoctorHeadshots,
  getDoctors,
  getPrimaryLocation,
  toTelHref,
} from "@/lib/content";
import { clientEnv } from "@/lib/env";
import { toPlainText } from "@/lib/markdown";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";

const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

const DESCRIPTION =
  "The consultants and clinicians who see patients at Paelon Memorial Hospital, what they specialise in, and how to book a consultation.";

export const metadata: Metadata = {
  title: "Our specialists",
  description: DESCRIPTION,
  alternates: { canonical: "/doctors" },
  openGraph: {
    type: "website",
    url: new URL("/doctors", siteUrl).toString(),
    siteName: "Paelon Memorial Hospital",
    title: "Our specialists | Paelon Memorial Hospital",
    description: DESCRIPTION,
    images: OG_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Our specialists | Paelon Memorial Hospital",
    description: DESCRIPTION,
    images: TWITTER_IMAGES,
  },
};

/** Matches the other content routes: seeded content, revalidated hourly. */
export const revalidate = 3600;

/**
 * Our Specialists `/doctors` (Figma node 2653-7).
 *
 * ## Why this route exists now
 *
 * The 2026-09-28 ruling that built `/doctors/[slug]` also said there would be
 * no index: a profile was to be reached from the leadership team on `/about`,
 * and an index over an empty table is a blank page. Francis has since asked
 * for this page from the Figma design, which reverses that half of the call —
 * the header's "Our Specialists" item has pointed at `/services` for want of a
 * destination since the nav was built, and `app/sitemap.ts` has always listed
 * `/doctors`. Spec §6 still needs amending to name the template.
 *
 * ## The content situation
 *
 * `seed/doctors.json` does not exist, so the `doctors` table is empty and this
 * page renders its banner and a pending note until the team is seeded or
 * published through `/admin/doctors`. The names, roles and bios in the mock
 * are lorem ipsum under real-looking names — a clinician's credentials are the
 * one kind of content on this site where a plausible placeholder is a real
 * harm rather than a shortcut, so none of it is transcribed into seed data.
 */
export default async function DoctorsPage() {
  const [doctors, location] = await Promise.all([
    getDoctors(),
    getPrimaryLocation(),
  ]);
  const headshots = await getDoctorHeadshots(doctors);

  /**
   * `Physician` per clinician (spec §11), wrapped in an `ItemList` because
   * this page lists several rather than being one profile. Each item points at
   * its own profile, which is the page that carries the full `Physician` node;
   * only seeded facts appear here, as on that page.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Specialists at Paelon Memorial Hospital",
    itemListElement: doctors.map((doctor, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Physician",
        name: doctor.name,
        url: new URL(`/doctors/${doctor.slug}`, siteUrl).toString(),
        jobTitle: doctor.title,
        ...(doctor.bio ? { description: toPlainText(doctor.bio) } : {}),
        ...(doctor.specialties.length > 0
          ? { medicalSpecialty: doctor.specialties }
          : {}),
        worksFor: {
          "@type": "Hospital",
          name: "Paelon Memorial Hospital",
          url: siteUrl,
        },
      },
    })),
  };

  return (
    <>
      {doctors.length > 0 ? (
        <script
          type="application/ld+json"
          // Built above from seeded values; nothing here is user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}

      {/*
        TODO(asset): the mock sets this band over a photograph of clinicians in
        consultation, tinted down so the heading stays legible. That file has
        not been delivered (seed/README.md), so the band is the flat brand
        navy the tint resolves to. Add a banner slot to lib/images.ts when the
        photograph arrives — not a stock picture of someone else's hospital.
      */}
      <section className="bg-primary px-4 py-16 text-center sm:px-6 lg:py-24">
        <h1 className="text-4xl font-bold text-primary-foreground lg:text-5xl">
          Our Specialists
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-primary-foreground/85">
          {DESCRIPTION}
        </p>
      </section>

      <div className="mx-auto max-w-360 px-4 pt-8 sm:px-6 lg:px-25">
        <Breadcrumbs trail={[{ label: "Our specialists" }]} />
      </div>

      <div className="mx-auto max-w-360 px-4 py-12 sm:px-6 lg:px-25 lg:py-16">
        {doctors.length > 0 ? (
          <ul className="flex flex-col gap-10 lg:gap-14">
            {doctors.map((doctor, index) => (
              <li key={doctor.id}>
                <SpecialistCard
                  doctor={doctor}
                  headshot={headshots.get(doctor.id)}
                  priority={index === 0}
                />
              </li>
            ))}
          </ul>
        ) : (
          /* TODO(seed): the clinical team, for every field. See seed/README.md
             — this is the same gap that leaves /about without its leadership
             section. */
          <PendingNote
            action={
              location ? (
                <Button asChild variant="outline" size="sm">
                  <a href={toTelHref(location.phone)}>
                    Call {location.phone}
                    <span className="sr-only">
                      {" "}
                      to ask which specialist you need
                    </span>
                  </a>
                </Button>
              ) : undefined
            }
          >
            We have not published our consultants&rsquo; profiles yet. Call us
            and the front desk will tell you which specialist you need and when
            they are in, or book an appointment and we will match you to one.
          </PendingNote>
        )}

        <div className="mt-12 flex flex-col gap-4 sm:flex-row lg:mt-16">
          <Button asChild size="pill" className="w-full sm:w-auto sm:min-w-50">
            <Link href="/book">Book an appointment</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="pill"
            className="w-full sm:w-auto sm:min-w-50"
          >
            <Link href="/services">Browse medical services</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
