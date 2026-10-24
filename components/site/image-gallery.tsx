import Image from "next/image";

import type { ContentImage } from "@/lib/content";

interface ImageGalleryProps {
  /** Resolved `media` rows in the editor's order — `getServiceGallery` et al. */
  images: readonly ContentImage[];
  /** Section heading. Named rather than generic: "Photos" says nothing. */
  heading: string;
  /** Ties the heading to the section for `aria-labelledby`. */
  headingId: string;
  className?: string;
}

/**
 * A branch's or service's photographs, as a static grid of figures.
 *
 * ## Why a grid and not a slider
 *
 * CLAUDE.md names the current site's auto-rotating slider as an anti-pattern
 * for this brand, so every image here is visible at once and reachable by
 * scrolling. That also means the component ships no JavaScript: it is a server
 * component rendering `next/image` tags, and there is no state to hydrate.
 *
 * ## Dimensions and layout stability
 *
 * Each row carries its own intrinsic width and height, so every box is
 * reserved before the bytes arrive and the grid contributes nothing to CLS
 * (spec §13 budget: < 0.05). `getServiceGallery` and `getLocationGallery` drop
 * rows that have no dimensions, so an unsized asset never reaches this
 * component — which is why there is no fallback branch here.
 *
 * The images are deliberately uniform (`aspect-[4/3]`, `object-cover`) rather
 * than honouring each file's own ratio: a gallery an editor fills from the
 * media library will mix portrait phone photos with wide press shots, and a
 * masonry of mismatched heights reads as a mistake. `sizes` describes the real
 * grid — three columns on desktop, two on tablet, one on mobile — so a phone
 * never downloads a desktop-width file.
 *
 * Never `priority`. A gallery sits below a hero on both templates that use it,
 * and the hero is the LCP candidate.
 *
 * ## Alt text
 *
 * Taken from the `media` row, `""` included. An editor who left it blank marked
 * the image decorative, and this component will not invent a description for a
 * photograph of a hospital — CLAUDE.md baseline 10 makes alt text an editorial
 * fact, not a field a template fills in. A decorative image is also hidden from
 * assistive technology, so a screen reader is not read a list of empty images.
 *
 * Renders nothing when the gallery is empty, which is the normal state until an
 * editor fills one in.
 */
export function ImageGallery({
  images,
  heading,
  headingId,
  className,
}: ImageGalleryProps) {
  if (images.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="text-2xl text-primary lg:text-3xl">
        {heading}
      </h2>

      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((image) => (
          <li
            key={image.url}
            className="relative aspect-[4/3] overflow-hidden rounded-lg bg-secondary"
          >
            <Image
              src={image.url}
              alt={image.alt}
              // Non-null: the getters drop rows without dimensions.
              width={image.width ?? undefined}
              height={image.height ?? undefined}
              sizes="(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw"
              className="absolute inset-0 size-full object-cover"
              aria-hidden={image.alt === "" ? true : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
