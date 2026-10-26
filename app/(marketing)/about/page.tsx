import type { Metadata } from "next";

import { ArticleBody } from "@/components/site/article-body";
import { AwardsTimeline } from "@/components/site/awards-timeline";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { ContentSections } from "@/components/site/content-sections";
import { DoctorCard } from "@/components/site/doctor-card";
import { PendingNote } from "@/components/site/pending-note";
import { Button } from "@/components/ui/button";
import { getAboutContent, isAboutEmpty } from "@/lib/about";
import {
  getAboutSections,
  getAwards,
  getBodyImages,
  getSectionImages,
  getDoctors,
  getPrimaryLocation,
  toTelHref,
  type ContentImage,
} from "@/lib/content";
import { clientEnv } from "@/lib/env";
import { toPlainText } from "@/lib/markdown";
import {
  medicalOrganizationLd,
  OG_IMAGES,
  TWITTER_IMAGES,
} from "@/lib/seo";
import type { AboutContent } from "@/lib/validation/about";
import { serializeJsonLd } from "@/lib/json-ld";

const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

/**
 * About (spec §6 About).
 *
 * ## What comes from where
 *
 * Three sources, all of them Postgres since migration 0005. The prose —
 * founding story, mission, vision, value proposition, motto, ESG — is the
 * `about_content` singleton behind `lib/about.ts`, written in `/admin/about`.
 * The leadership team is the `doctors` table, and each card links to the
 * profile at `/doctors/[slug]`. The awards timeline is the `awards` table.
 *
 * ## Why so much of it renders nothing today
 *
 * None of the three has content. The `about_content` row ships with every
 * field null, and neither `seed/doctors.json` nor `seed/awards.json` exists. Spec §6
 * asks for a founding story about Patricia and Dr. Ngozi Onyia, a mission, a
 * vision and an ESG certification claim: real people and verifiable claims about
 * the hospital, every one of which CLAUDE.md forbids drafting. So each section
 * renders only when its content exists, and the page states the gap once rather
 * than repeating an apology per section.
 *
 * The route is built now regardless, because `/about` is already linked from the
 * main nav, the footer and the "For Patricia" block on the homepage — three live
 * links that were 404ing — and because `/doctors/[slug]` needs a parent page for
 * a reader to arrive from.
 *
 * ## Structured data
 *
 * `MedicalOrganization`, which spec §11 asks for on the homepage and here. It
 * comes from `medicalOrganizationLd` rather than a second literal: two
 * hand-written copies of the same claims about the hospital drift the moment one
 * page is edited. `Breadcrumbs` emits the `BreadcrumbList`.
 */

const FALLBACK_DESCRIPTION =
  "About Paelon Memorial Hospital — our story, our leadership team, and the awards and accreditations we hold.";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const about = await getAboutContent();

  const description = about.intro
    ? toPlainText(about.intro).slice(0, 200)
    : FALLBACK_DESCRIPTION;
  const title = "About us";

  return {
    title,
    description,
    alternates: { canonical: "/about" },
    /*
     * Same rule as the legal pages: an About page whose sections are still
     * empty must not rank for the hospital's name. `follow` stays on so the
     * doctor profiles linked from here are still discovered. This lifts itself
     * the moment `published` is ticked in `/admin/about`.
     */
    ...(about.published ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "website",
      url: new URL("/about", siteUrl).toString(),
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

export default async function AboutPage() {
  const [about, sections] = await Promise.all([getAboutContent(), getAboutSections()]);

  // The page's blocks (Page layout in /admin/about) when it has any; otherwise
  // the five legacy prose fields, kept as the fallback since migration 0008.
  const useSections = sections.length > 0;

  const [doctors, awards, primary, images] = await Promise.all([
    getDoctors(),
    getAwards(),
    getPrimaryLocation(),
    useSections
      ? getSectionImages(sections)
      : getBodyImages(
          // Joined with blank lines so each body stays its own blocks.
          [about.founding_story, about.mission, about.vision, about.value_proposition, about.esg]
            .filter(Boolean)
            .join("\n\n"),
        ),
  ]);

  const nothingWritten = !useSections && isAboutEmpty(about);
  const organizationLd = medicalOrganizationLd(siteUrl, primary);

  return (
    <>
      <script
        type="application/ld+json"
        // serializeJsonLd escapes `<` and friends: values here include admin-edited content.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationLd) }}
      />

      <div className="mx-auto max-w-360 px-4 pt-8 sm:px-6 lg:px-25">
        <Breadcrumbs trail={[{ label: "About us" }]} />
      </div>

      <div className="mx-auto max-w-360 px-4 py-12 sm:px-6 lg:px-25 lg:py-16">
        <h1 className="max-w-3xl text-4xl font-bold text-primary lg:text-5xl">
          About Paelon Memorial Hospital
        </h1>

        {about.intro ? (
          <div className="mt-6 max-w-2xl text-lg text-foreground/80 lg:text-xl">
            <ArticleBody source={about.intro} />
          </div>
        ) : null}

        {nothingWritten ? (
          /*
           * TODO(seed): every field of the `about_content` row — the founding
           * story, mission, vision, value proposition, motto and ESG block.
           * Written in `/admin/about`; content/README.md says what each one is
           * and where it renders.
           */
          <PendingNote
            className="mt-8 max-w-2xl"
            action={
              primary ? (
                <Button asChild variant="outline" size="sm">
                  <a href={toTelHref(primary.phone)}>Call {primary.phone}</a>
                </Button>
              ) : undefined
            }
          >
            We have not published our story yet. Call us and we will tell you
            about the hospital, or see our medical services and branches.
          </PendingNote>
        ) : null}

        {useSections ? (
          <div className="mt-16">
            <ContentSections sections={sections} images={images} idPrefix="about-section" />
          </div>
        ) : (
          <>
            <Prose
              heading="Our story"
              id="founding-story"
              source={about.founding_story}
              images={images}
            />
            <Prose heading="Our mission" id="mission" source={about.mission} images={images} />
            <Prose heading="Our vision" id="vision" source={about.vision} images={images} />
            <Prose
              heading="What we offer"
              id="value-proposition"
              source={about.value_proposition}
              images={images}
            />
          </>
        )}

        {about.motto ? (
          <figure className="mt-16 max-w-2xl border-l-2 border-accent pl-6">
            <blockquote className="text-2xl text-primary lg:text-3xl">
              <p>{about.motto}</p>
            </blockquote>
            <figcaption className="mt-3 text-sm text-muted-foreground">
              Paelon Memorial Hospital
            </figcaption>
          </figure>
        ) : null}

        <AwardsTimeline awards={awards} />

        {/* The leadership team. Renders nothing while the `doctors` table is
            empty, which it is — seed/doctors.json does not exist. */}
        {doctors.length > 0 ? (
          <section aria-labelledby="leadership-heading" className="mt-16">
            <h2
              id="leadership-heading"
              className="text-2xl text-accent lg:text-3xl"
            >
              Our leadership team
            </h2>

            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {doctors.map((doctor) => (
                <li key={doctor.id}>
                  <DoctorCard doctor={doctor} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* In the blocks when the page has them; the legacy field otherwise. */}
        {useSections ? null : (
          <Prose
            heading="Sustainability and certification"
            id="esg"
            source={about.esg}
            images={images}
          />
        )}
      </div>
    </>
  );
}

/**
 * One prose section, or nothing at all.
 *
 * A heading with no body beneath it reads as a page that failed to load, and it
 * breaks the sequential heading hierarchy spec §12 requires — so an unwritten
 * section takes its `h2` with it.
 */
function Prose({
  heading,
  id,
  source,
  images,
}: {
  heading: string;
  id: string;
  source: AboutContent["founding_story"];
  /** Figures across every section, resolved once by the page. */
  images: ReadonlyMap<string, ContentImage>;
}) {
  if (source === null) return null;

  return (
    <section aria-labelledby={id} className="mt-16">
      <h2 id={id} className="text-2xl text-accent lg:text-3xl">
        {heading}
      </h2>
      {/* The editor's headings render one level under this h2, matching the
          admin preview (headingOffset). */}
      <div className="mt-4">
        <ArticleBody source={source} images={images} headingOffset={1} />
      </div>
    </section>
  );
}
