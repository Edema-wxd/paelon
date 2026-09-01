"use client";

import { Phone, RotateCw } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getPrimaryLocation, toTelHref } from "@/lib/content";

/**
 * Route-level error boundary. Catches anything thrown while rendering a page
 * under `app/`, including the marketing routes, and replaces `{children}` inside
 * `app/layout.tsx` — so the skip link and `<body>` are still in place, but the
 * marketing header and footer are not.
 *
 * Chrome is rebuilt here rather than imported. `Header` and `Footer` are server
 * components; pulling them into a client boundary would drag the whole site
 * chrome into this chunk, and a boundary that is heavier than the page it
 * protects is the wrong trade. The one thing worth carrying over is the
 * emergency line — `lib/content` is ~3.5 KB of seed JSON and type-only imports.
 *
 * Written to the rules in spec §12 and CLAUDE.md: state what happened, say what
 * is unaffected, and hand over an action that still works. A hospital error page
 * is read by someone wondering whether they just broke their appointment.
 */
export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const location = getPrimaryLocation();
  const telHref = location ? toTelHref(location.emergency_line) : null;

  // Nothing is logged from here on purpose. `lib/logger` writes through
  // `process.stderr`, which does not exist in a browser — importing it into
  // this boundary would make the boundary itself throw, escalating a recoverable
  // page error into a blank global error. Server errors are already logged
  // server-side; `error.digest` below is the handle that ties the two together.

  return (
    <main id="main" className="mx-auto max-w-360 px-4 py-16 sm:px-6 lg:px-25 lg:py-24">
      <p className="text-sm font-medium tracking-[0.2em] text-accent uppercase">
        Something went wrong
      </p>

      <h1 className="mt-4 max-w-3xl text-4xl font-bold text-primary lg:text-5xl">
        This page did not load.
      </h1>

      <p className="mt-6 max-w-2xl text-lg text-foreground/80 lg:text-xl">
        The fault is on our side, not yours. Any appointment you have already
        booked is unaffected, and nothing you submitted has been lost.
      </p>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
        {/* Declared first so it reads first on mobile and to a screen reader —
            same ordering decision as the 404. */}
        {location && telHref ? (
          <aside
            aria-labelledby="error-emergency-heading"
            className="rounded-xl bg-accent p-6 text-accent-foreground lg:col-start-2 lg:row-start-1"
          >
            <h2 id="error-emergency-heading" className="text-xl font-medium">
              Emergency
            </h2>
            <p className="mt-2 text-base text-accent-foreground/85">
              Our line is open 24 hours, every day, whatever this page is doing.
            </p>
            <a
              href={telHref}
              className="mt-5 block rounded-md text-3xl font-bold underline-offset-4 hover:underline"
            >
              {location.emergency_line}
            </a>
            <Button
              asChild
              variant="secondary"
              className="mt-6 h-12 w-full rounded-full text-base"
            >
              <a href={telHref}>
                <Phone aria-hidden />
                Call now
              </a>
            </Button>
          </aside>
        ) : null}

        <div className="lg:col-start-1 lg:row-start-1">
          <h2 className="text-xl font-medium text-primary">What to try</h2>
          <ul className="mt-4 space-y-3 text-base leading-relaxed text-foreground/80">
            <li>Reload the page — most of these clear on a second attempt.</li>
            <li>
              If it happens again, tell us what you were doing on the{" "}
              <Link
                href="/contact"
                className="text-accent underline underline-offset-4 hover:no-underline"
              >
                contact page
              </Link>
              .
            </li>
            <li>For anything urgent, call the number on this page.</li>
          </ul>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Button
              type="button"
              onClick={reset}
              size="pill"
              className="w-full sm:w-auto sm:min-w-50"
            >
              <RotateCw aria-hidden />
              Try again
            </Button>
            <Button
              asChild
              variant="outline"
              size="pill"
              className="w-full sm:w-auto sm:min-w-50"
            >
              <Link href="/">Back to homepage</Link>
            </Button>
          </div>

          {/* Quiet, selectable, and only rendered when Next actually produced
              one. It is the only thing that makes a report actionable. */}
          {error.digest ? (
            <p className="mt-10 text-sm text-muted-foreground">
              Reference for support:{" "}
              <span className="font-medium text-foreground">
                {error.digest}
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
