import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Homepage hero. One calm still image, no slider — spec §6 names the current
 * site's auto-rotating slider as an anti-pattern for this brand.
 *
 * Headline and subhead are static marketing copy, so they live here rather
 * than in seed data.
 */
export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden" aria-labelledby="hero-heading">
      {/*
        The LCP element — `priority` opts it out of lazy loading so it is
        discovered in the initial HTML rather than after hydration, which the
        LCP < 2.0s budget in spec §13 depends on.

        `sizes="100vw"` because the section is full-bleed at every breakpoint.
        Decorative: `alt=""` — the headline beside it carries the meaning, and
        the photograph adds nothing a screen reader user would miss.

        Source is 2880x1362 — 2x at the 1440px container width, so the
        generated ladder covers retina without upscaling.
      */}
      <Image
        src="/images/paelon-hero.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />

      {/* The export washes the photo with a 50% white veil so the copy stays
          legible. Kept, and strengthened on small screens where the text sits
          over the busiest part of the frame. */}
      <div
        className="absolute inset-0 bg-background/85 lg:bg-background/60"
        aria-hidden
      />

      <div className="relative mx-auto max-w-360 px-4 py-16 sm:px-6 lg:px-25 lg:py-32">
        <h1
          id="hero-heading"
          className="max-w-3xl text-4xl font-bold text-primary sm:text-5xl lg:text-6xl"
        >
          Expertly Human
          <br />
          Healthcare
        </h1>

        <p className="mt-8 max-w-4xl text-lg text-foreground/80 lg:text-2xl">
          At Paelon, we believe healing begins with feeling at home. Our family
          centered approach ensures that every patient from our smallest
          toddlers to our cherished elders receives world class medical
          expertise wrapped in compassionate care.
        </p>

        <div className="mt-10 flex flex-col items-stretch gap-4 sm:flex-row">
          <Button asChild size="pill" className="w-full sm:w-50">
            <Link href="/book">Book Appointment</Link>
          </Button>

          {/*
            TODO(design): spec §6 specifies "one primary CTA: Book Appointment"
            for this hero. The Figma export shows a second button. Kept as a
            visually secondary outline button so the primary action still reads
            as primary — Francis to confirm whether it stays at all.

            TODO(design): "Our Specialists" has no route in spec §6; points at
            /services. See nav-items.ts.
          */}
          {/* Shrink-to-content and centred on mobile. Stacked at equal full
              width, the outline treatment alone was not enough to stop these
              reading as two co-equal CTAs, which spec §6 explicitly does not
              want. */}
          <Button
            asChild
            variant="outline"
            size="pill"
            className="self-center px-8 sm:w-50 sm:self-auto sm:px-0"
          >
            <Link href="/services">Our Specialists</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
