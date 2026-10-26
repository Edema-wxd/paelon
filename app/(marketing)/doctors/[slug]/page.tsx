import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import Image from "next/image";

import { ArticleBody } from "@/components/site/article-body";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { PendingNote } from "@/components/site/pending-note";
import { SiteImage } from "@/components/site/site-image";
import { Button } from "@/components/ui/button";
import {
  getDoctorBySlug,
  getDoctorHeadshots,
  getDoctors,
  getLocationsByDoctor,
  getPrimaryLocation,
  toTelHref,
  type Doctor,
} from "@/lib/content";
import { clientEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { toPlainText } from "@/lib/markdown";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/json-ld";

const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Doctor profile (spec §11: "`Physician` on each doctor profile").
 *
 * ## Why this route exists
 *
 * Spec §6 lists doctors only as the "Leadership team with photos and bios"
 * section of `/about`, but §11 requires `Physician` structured data on a doctor
 * profile, `app/sitemap.ts` has always emitted `/doctors/<slug>`, and
 * `lib/auth/policy.ts` puts `doctors` among the four types "whose rows own a
 * public URL" when it restricts who may delete one. Three parts of the project
 * assumed this page; only §6 did not. Ratified with Francis on 2026-09-28: the
 * profiles are built and `/about` links to them. §6 and the §3 tree are amended
 * to match.
 *
 * The same ruling said there would be no `/doctors` index: a profile was to be
 * reached from the leadership team on `/about`, and an index over an empty
 * table would be a blank page. Francis reversed that half on 2026-10-22 and
 * asked for the Figma "Our Specialists" page, so `app/(marketing)/doctors/
 * page.tsx` is now the index and both routes reach a profile.
 *
 * ## The content situation
 *
 * `seed/doctors.json` does not exist, so the `doctors` table is empty: this
 * route resolves nothing until Francis supplies the team, and `/about` shows no
 * leadership section. A doctor's name, title, qualifications and bio are claims
 * about a real clinician's credentials — the one kind of content on this site
 * where inventing a placeholder would be a genuine harm rather than a
 * shortcut — so nothing is drafted here.
 *
 * The page is still useful empty: an editor creates a doctor in
 * `/admin/doctors`, leaves it unpublished, and previews it here through
 * `/api/preview`, which is what made this route the Preview target.
 */

/** Every published doctor is known at build time. */
export async function generateStaticParams() {
  try {
    return (await getDoctors()).map((doctor) => ({ slug: doctor.slug }));
  } catch (error) {
    // Matches the services, blog and locations routes: an unreachable database
    // during a build degrades to on-demand rendering rather than failing the
    // deploy.
    logger.warn("doctors.static_params_failed", { error });
    return [];
  }
}

export const revalidate = 3600;

/**
 * "Consultant Paediatrician at Paelon Memorial Hospital" — or the first
 * sentence of the bio, when there is one.
 *
 * Built from the row's own fields either way. Nothing is asserted that the seed
 * does not hold, which is the same rule the service page's fallback follows.
 */
function describe(doctor: Doctor): string {
  if (doctor.bio) {
    const plain = toPlainText(doctor.bio);
    if (plain.length > 0) return plain.slice(0, 200);
  }

  const specialties =
    doctor.specialties.length > 0
      ? ` Specialises in ${listSentence(doctor.specialties)}.`
      : "";

  return `${doctor.title} at Paelon Memorial Hospital.${specialties}`;
}

/** "a, b and c" — an Oxford-comma-free list for running prose. */
function listSentence(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doctor = await getDoctorBySlug(slug);

  if (!doctor) return { title: "Doctor not found" };

  const description = describe(doctor);
  const url = new URL(`/doctors/${doctor.slug}`, siteUrl).toString();
  const title = `${doctor.name}, ${doctor.title}`;

  return {
    title,
    description,
    alternates: { canonical: `/doctors/${doctor.slug}` },
    openGraph: {
      type: "profile",
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

export default async function DoctorProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const doctor = await getDoctorBySlug(slug);

  if (!doctor) notFound();

  const [branches, primary, headshots] = await Promise.all([
    getLocationsByDoctor(doctor.id),
    getPrimaryLocation(),
    getDoctorHeadshots([doctor]),
  ]);

  /*
   * The photograph an editor uploaded against this row, if there is one.
   * Dimensions are what let `next/image` reserve the box; a `media` row from
   * before migration 0004 has none, and the placeholder is better than a
   * portrait that shifts the page as it loads (spec §13 CLS budget).
   */
  const uploaded = headshots.get(doctor.id);
  const portrait =
    uploaded && uploaded.width !== null && uploaded.height !== null
      ? { ...uploaded, width: uploaded.width, height: uploaded.height }
      : null;

  const url = new URL(`/doctors/${doctor.slug}`, siteUrl).toString();

  /**
   * `Physician` per spec §11.
   *
   * Only seeded facts, like the `MedicalProcedure` on a service page: `image`
   * only when a headshot has been uploaded, `description` only when a bio
   * exists. A structured-data field is a machine-readable claim, and one
   * filled to satisfy a validator is not a claim worth publishing.
   */
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Physician",
    name: doctor.name,
    url,
    jobTitle: doctor.title,
    ...(portrait ? { image: portrait.url } : {}),
    ...(doctor.bio ? { description: toPlainText(doctor.bio) } : {}),
    ...(doctor.specialties.length > 0
      ? { medicalSpecialty: doctor.specialties }
      : {}),
    ...(doctor.languages_spoken.length > 0
      ? { knowsLanguage: doctor.languages_spoken }
      : {}),
    ...(doctor.qualifications.length > 0
      ? { hasCredential: doctor.qualifications }
      : {}),
    worksFor: {
      "@type": "Hospital",
      name: "Paelon Memorial Hospital",
      url: siteUrl,
    },
    ...(branches.length > 0
      ? {
          workLocation: branches.map((branch) => ({
            "@type": "Place",
            name: branch.name,
            url: new URL(`/locations/${branch.slug}`, siteUrl).toString(),
          })),
        }
      : {}),
  };

  /*
   * A booking deep link, pre-filled with the branch when there is exactly one
   * (CLAUDE.md: `?branch=<slug>` pre-fills step 1 and the flow skips it). With
   * several branches the reader has to choose, and choosing for them would put
   * them at the wrong hospital. There is no per-doctor slot booking — spec §17
   * puts that out of scope — so the CTA never implies one.
   */
  const bookHref =
    branches.length === 1 && branches[0]
      ? `/book?branch=${branches[0].slug}`
      : "/book";

  const facts: { label: string; value: string }[] = [
    ...(doctor.qualifications.length > 0
      ? [{ label: "Qualifications", value: doctor.qualifications.join(", ") }]
      : []),
    ...(doctor.specialties.length > 0
      ? [{ label: "Specialties", value: doctor.specialties.join(", ") }]
      : []),
    ...(doctor.languages_spoken.length > 0
      ? [{ label: "Languages", value: doctor.languages_spoken.join(", ") }]
      : []),
    ...(doctor.years_experience !== null
      ? [
          {
            label: "Experience",
            value: `${doctor.years_experience} ${
              doctor.years_experience === 1 ? "year" : "years"
            }`,
          },
        ]
      : []),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // serializeJsonLd escapes `<` and friends: values here include admin-edited content.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <div className="mx-auto max-w-360 px-4 pt-8 sm:px-6 lg:px-25">
        <Breadcrumbs
          trail={[
            { label: "Our specialists", href: "/doctors" },
            { label: doctor.name },
          ]}
        />
      </div>

      <article className="mx-auto max-w-360 px-4 py-12 sm:px-6 lg:px-25 lg:py-16">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {/*
            The headshot uploaded in /admin/doctors, which is the same image
            the card on /doctors shows — one upload, both pages.

            Decorative either way: the h1 beside it names the person, which is
            everything the photograph would tell a screen-reader user.

            With nothing uploaded it falls back to the build-time `portrait`
            slot (100px, assets/portrait/<slug>), and with neither to a
            labelled placeholder. TODO(asset): no headshots exist in either
            place yet.
          */}
          {portrait ? (
            <Image
              src={portrait.url}
              alt=""
              width={portrait.width}
              height={portrait.height}
              sizes="100px"
              className="size-25 shrink-0 rounded-full object-cover object-top"
            />
          ) : (
            <SiteImage
              kind="portrait"
              name={doctor.slug}
              alt=""
              className="size-25 shrink-0 rounded-full object-cover"
            />
          )}

          <div>
            <h1 className="text-3xl font-bold text-primary lg:text-4xl">
              {doctor.name}
            </h1>
            <p className="mt-2 text-lg text-accent">{doctor.title}</p>

            {/* Text, not a coloured chip: colour is never the only carrier of
                state (spec §12). */}
            <p className="mt-1 text-sm text-muted-foreground">
              {doctor.in_house && doctor.visiting
                ? "In-house and visiting consultant"
                : doctor.visiting
                  ? "Visiting consultant"
                  : "In-house consultant"}
            </p>
          </div>
        </header>

        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
          <div>
            {doctor.bio ? (
              <section aria-labelledby="bio-heading">
                <h2 id="bio-heading" className="text-2xl text-accent lg:text-3xl">
                  About {doctor.name}
                </h2>
                <div className="mt-4">
                  <ArticleBody source={doctor.bio} />
                </div>
              </section>
            ) : (
              /* TODO(seed): bio, for every doctor. A biography is a claim about
                 a clinician's training and career — not something to draft. */
              <PendingNote
                action={
                  primary?.phone ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={toTelHref(primary.phone)}>
                        Call {primary.phone}
                      </a>
                    </Button>
                  ) : undefined
                }
              >
                We have not published this consultant&rsquo;s biography yet. Call
                us and we will tell you about their training and the conditions
                they treat.
              </PendingNote>
            )}

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Button asChild size="pill" className="w-full sm:w-auto sm:min-w-50">
                <Link href={bookHref}>Book an appointment</Link>
              </Button>
              {primary?.phone ? (
                <Button
                  asChild
                  variant="outline"
                  size="pill"
                  className="w-full sm:w-auto sm:min-w-50"
                >
                  <a href={toTelHref(primary.phone)}>Call {primary.phone}</a>
                </Button>
              ) : null}
            </div>
          </div>

          <aside>
            {facts.length > 0 ? (
              <div className="rounded-xl bg-secondary p-6">
                <h2 className="text-lg font-medium text-primary">Credentials</h2>
                <dl className="mt-4 space-y-4">
                  {facts.map((fact) => (
                    <div key={fact.label}>
                      <dt className="text-sm text-muted-foreground">
                        {fact.label}
                      </dt>
                      <dd className="mt-1 text-base text-foreground/80">
                        {fact.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {branches.length > 0 ? (
              <nav
                aria-labelledby="branches-heading"
                className="mt-8 first:mt-0"
              >
                <h2
                  id="branches-heading"
                  className="text-lg font-medium text-primary"
                >
                  Practises at
                </h2>
                <ul className="mt-4 space-y-2">
                  {branches.map((branch) => (
                    <li key={branch.id}>
                      <Link
                        href={`/locations/${branch.slug}`}
                        className="text-base text-accent underline underline-offset-4 hover:no-underline"
                      >
                        {branch.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </aside>
        </div>
      </article>
    </>
  );
}
