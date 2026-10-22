import Image from "next/image";
import Link from "next/link";

import { ArticleBody } from "@/components/site/article-body";
import { AssetPlaceholder } from "@/components/site/asset-placeholder";
import { Button } from "@/components/ui/button";
import type { ContentImage, Doctor } from "@/lib/content";

interface SpecialistCardProps {
  doctor: Doctor;
  /** Resolved `media` row for this doctor's headshot, when one is uploaded. */
  headshot?: ContentImage;
  /** Lift the first card out of lazy loading — it is above the fold. */
  priority?: boolean;
}

/**
 * The photograph's rendered box. 444px is the Figma card's second column; the
 * tablet step matches the 38% track the grid falls back to, and below that the
 * card is stacked and the image is full-bleed.
 */
const PORTRAIT_SIZES =
  "(min-width: 1280px) 444px, (min-width: 768px) 38vw, 100vw";

/**
 * One clinician, as a full-width card on `/doctors` (Figma "Our Specialists",
 * node 2653-7).
 *
 * The mock alternates white and cream card fills down the stack. That works on
 * the mock, whose page is white; this site's page background *is* that cream,
 * so every other card would read as a shadow floating on nothing. All cards
 * take the white surface instead, which keeps the contrast the design intended.
 *
 * TODO(design): the mock sets the role line in a 50%-opacity teal (#156D78)
 * that is absent from the spec §4 palette and misses 4.5:1 on white at that
 * opacity. Rendered in brand maroon, matching the role line on the profile
 * page, until Francis confirms a teal that passes AA.
 *
 * Everything below the name is conditional. A doctor seeded without a bio
 * shows a name, a role and a way to book — never invented credentials
 * (CLAUDE.md).
 *
 * `reveal-on-scroll` is the page's only non-interactive motion: each card
 * settles into place as it enters the viewport, scroll-driven so it plays when
 * someone is actually looking at it. See the rule in `styles/globals.css` for
 * why it cannot touch the LCP card or a reduced-motion reader.
 */
export function SpecialistCard({
  doctor,
  headshot,
  priority,
}: SpecialistCardProps) {
  // Dimensions are what let `next/image` reserve the box; a row uploaded
  // before migration 0004 has none, and a photograph that shifts the layout
  // costs more than the placeholder does (spec §13 CLS budget).
  const portrait =
    headshot && headshot.width !== null && headshot.height !== null
      ? { ...headshot, width: headshot.width, height: headshot.height }
      : null;

  return (
    <article className="reveal-on-scroll grid overflow-hidden rounded-xl bg-surface shadow-md md:grid-cols-[minmax(0,1fr)_38%] xl:grid-cols-[minmax(0,1fr)_27.75rem]">
      <div className="order-2 flex flex-col p-6 sm:p-8 md:order-1 lg:p-10">
        {/*
          The name is the link, not the whole card: a card-sized target holding
          a name, a role, a bio and a chip row gives a screen reader one
          enormous link label. Same rule as `DoctorCard` on /about.
        */}
        <h2 className="text-3xl text-primary sm:text-4xl lg:text-5xl xl:text-6xl">
          <Link
            href={`/doctors/${doctor.slug}`}
            className="rounded-sm underline-offset-4 hover:text-accent hover:underline"
          >
            {doctor.name}
          </Link>
        </h2>

        <p className="mt-3 text-lg text-accent sm:text-xl lg:text-2xl">
          {doctor.title}
        </p>

        {doctor.bio ? (
          // Markdown per spec §5, through the one renderer (CLAUDE.md). The
          // card shows it whole: a bio is 80–120 words, and truncating a
          // clinician's record mid-sentence to fit a mock is not a crop.
          <div className="mt-5 max-w-xl">
            <ArticleBody source={doctor.bio} />
          </div>
        ) : null}

        {doctor.qualifications.length > 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {doctor.qualifications.join(", ")}
          </p>
        ) : null}

        <div className="mt-auto flex flex-col gap-4 pt-8 xl:flex-row xl:items-center">
          {doctor.specialties.length > 0 ? (
            <ul
              aria-label={`${doctor.name}'s specialties`}
              className="flex flex-wrap gap-2"
            >
              {doctor.specialties.map((specialty) => (
                <li
                  key={specialty}
                  className="rounded-full bg-secondary px-5 py-3 text-xs text-secondary-foreground"
                >
                  {specialty}
                </li>
              ))}
            </ul>
          ) : null}

          {/*
            Every card carries the same visible label, so each link takes the
            clinician's name into its accessible name — a screen reader
            listing this page's links would otherwise read "Book Consultation
            Now" once per doctor with no way to tell them apart (spec §12).

            No doctor deep link: /book reads `service` and `branch` only
            (CLAUDE.md), and a parameter the flow ignores is a CTA that
            silently drops the choice the reader just made. Per-doctor slot
            booking is out of scope in spec §17.
          */}
          <Button
            asChild
            size="pill"
            // Press feedback only: the button confirms it was hit, in 120ms,
            // on transform alone. The global reduced-motion rule in
            // styles/globals.css collapses it for anyone who asks.
            className="w-full transition-transform duration-[120ms] active:scale-[0.98] xl:ml-auto xl:w-auto xl:min-w-[310px]"
          >
            <Link href="/book">
              Book Consultation Now
              <span className="sr-only"> with {doctor.name}</span>
            </Link>
          </Button>
        </div>
      </div>

      <div className="relative order-1 aspect-4/5 w-full bg-secondary sm:aspect-3/4 md:order-2 md:aspect-auto md:h-full">
        {portrait ? (
          <Image
            src={portrait.url}
            alt={portrait.alt}
            width={portrait.width}
            height={portrait.height}
            sizes={PORTRAIT_SIZES}
            priority={priority}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          /* TODO(asset): no clinician photographs have been delivered, and
             none is uploaded against these rows. Decorative — the heading
             beside it names the person, which is everything the photograph
             would tell a screen-reader user. */
          <AssetPlaceholder
            label={doctor.name}
            decorative
            className="absolute inset-0 h-full w-full"
          />
        )}
      </div>
    </article>
  );
}
