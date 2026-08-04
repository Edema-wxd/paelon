import { ArrowRight } from "lucide-react";
import Link from "next/link";

/**
 * "For Patricia" block (spec §6): quiet, prominent, links to the About page.
 *
 * Absent from the Figma export — built fresh.
 *
 * TODO(seed): the copy is deliberately minimal. Patricia is a real person in
 * the hospital's founding story (spec §6 names her alongside Dr. Ngozi Onyia),
 * and inventing detail about her would breach the no-fabrication rule in
 * CLAUDE.md. Francis to supply the real line before launch — until then this
 * block states only what spec §6 already asserts.
 */
export function ForPatriciaBlock() {
  return (
    <section
      aria-labelledby="for-patricia-heading"
      className="bg-surface py-16 lg:py-24"
    >
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2
          id="for-patricia-heading"
          className="text-3xl text-primary lg:text-4xl"
        >
          For Patricia
        </h2>
        {/*
          TODO(seed): the standfirst copy goes here. Intentionally left empty —
          Patricia is a real person and the founding story is a real event, so
          placeholder prose would be a fabricated claim about the hospital, not
          lorem ipsum. The block ships as heading + link until Francis supplies
          the line.
        */}
        <Link
          href="/about"
          className="mt-8 inline-flex items-center gap-2 rounded-md text-base text-accent underline underline-offset-4 hover:no-underline"
        >
          Read the Paelon founding story
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
