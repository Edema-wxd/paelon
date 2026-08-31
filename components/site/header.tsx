import Link from "next/link";

import { MobileNav } from "@/components/site/mobile-nav";
import { NAV_ITEMS } from "@/components/site/nav-items";
import { SiteImage } from "@/components/site/site-image";
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
          Goes through SiteImage like every other asset, so the logo picks up
          the `logo` slot's sizing and the engine's SVG pass-through rather
          than pointing at /public by hand.

          The accessible name lives on the link and the image is decorative,
          because the image is the entire content of the link — labelling both
          would announce the destination twice.

          TODO(asset): logo/main.svg is not really vector — it is a 175x81
          raster PNG base64-embedded in a <pattern>, with zero path elements,
          which is what Figma emits when a logo is placed as an image. At the
          138x64 slot it is already under 2x and will look soft on every
          retina display, on every page. Ask Francis for a true vector.
        */}
        <Link
          href="/"
          className="flex shrink-0 items-center rounded-md"
          aria-label="Paelon Memorial Hospital, home"
        >
          <SiteImage
            kind="logo"
            name="main"
            alt=""
            className="h-12 w-auto lg:h-16"
          />
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
                  , call {location.emergency_line}
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
