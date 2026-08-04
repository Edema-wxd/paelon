import Link from "next/link";

import { MobileNav } from "@/components/site/mobile-nav";
import { NAV_ITEMS } from "@/components/site/nav-items";
import { Button } from "@/components/ui/button";
import { getPrimaryLocation, toTelHref } from "@/lib/content";

/**
 * Global site header. Sticky on all breakpoints.
 *
 * The emergency line is reachable in one tap from here on desktop; on mobile
 * it lives in the bottom bar instead, per spec §6.
 */
export function Header() {
  const location = getPrimaryLocation();

  return (
    <header className="sticky top-0 z-40 bg-background shadow-sm">
      <div className="mx-auto flex h-20 max-w-360 items-center gap-6 px-4 sm:px-6 lg:h-26 lg:px-25">
        {/*
          TODO(asset): paelon-logo-2-x-10.png was not delivered. A text
          wordmark stands in rather than a grey placeholder block — a
          placeholder here put visible text ("Paelon logo") inside the link
          that did not match its accessible name, tripping WCAG 2.5.3 Label in
          Name. Swap for next/image with alt="Paelon Memorial Hospital" once
          the file lands.
        */}
        <Link
          href="/"
          className="flex shrink-0 items-center rounded-md text-lg leading-tight font-bold text-primary lg:text-xl"
        >
          Paelon
          <span className="sr-only"> Memorial Hospital — home</span>
        </Link>

        <nav aria-label="Primary" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-6">
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="rounded-md p-2 text-xl text-primary transition-colors hover:text-accent"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          {location ? (
            <Button
              asChild
              variant="accent"
              className="hidden h-11 rounded-full px-5 text-base lg:inline-flex"
            >
              <a href={toTelHref(location.emergency_line)}>
                Emergency
                <span className="sr-only">
                  {" "}
                  — call {location.emergency_line}
                </span>
              </a>
            </Button>
          ) : null}

          {/* Spec §6 requires a Book Appointment CTA in the header. The Figma
              export omits it — see nav-items.ts. */}
          <Button
            asChild
            className="hidden h-11 rounded-full px-5 text-base lg:inline-flex"
          >
            <Link href="/book">Book Appointment</Link>
          </Button>

          <MobileNav />
        </div>
      </div>
    </header>
  );
}
