import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { PendingNote } from "@/components/site/pending-note";

/**
 * "For Patricia" block (spec §6): quiet, prominent, links to the About page.
 *
 * Absent from the Figma export — built fresh.
 *
 * Set on the navy ground rather than white. It sat between two white sections
 * before, and with no body copy the result was a heading and a link floating in
 * 200px of empty white — indistinguishable from a section that had failed to
 * render. The dark band gives the page's quietest beat a hard edge on both
 * sides, so the restraint reads as a decision. See the ground sequence noted in
 * app/(marketing)/page.tsx.
 *
 * TODO(seed): the standfirst copy is still outstanding. Patricia is a real
 * person and the founding story is a real event, so placeholder prose here
 * would be a fabricated claim about the hospital rather than lorem ipsum. The
 * gap is stated plainly instead — see PendingNote's own docblock.
 */
export function ForPatriciaBlock() {
  return (
    <section
      aria-labelledby="for-patricia-heading"
      className="bg-primary py-20 text-primary-foreground lg:py-28"
    >
      <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
        <h2
          id="for-patricia-heading"
          className="text-3xl lg:text-4xl"
        >
          For Patricia
        </h2>

        <PendingNote className="mt-8 text-left">
          The line that belongs here has not been supplied yet. It is the one
          piece of copy on this page that cannot be drafted for you — Patricia
          is a real person, and the founding story is a real event.
        </PendingNote>

        {/*
          Cream, not `text-accent`. Brand maroon on brand navy measures 1.7:1,
          which fails WCAG AA by a wide margin — the accent colour only works as
          a link on the light grounds.
        */}
        <Link
          href="/about"
          className="mt-8 inline-flex items-center gap-2 rounded-md text-base text-primary-foreground underline underline-offset-4 hover:no-underline"
        >
          Read the Paelon founding story
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
