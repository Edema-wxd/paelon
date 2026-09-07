"use client";

import { CalendarPlus, Phone, RotateCw, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { NAV_ITEMS } from "@/components/site/nav-items";
import { SiteImage } from "@/components/site/site-image";
import { Button } from "@/components/ui/button";
import { EMERGENCY_LINE, EMERGENCY_TEL_HREF } from "@/lib/emergency";

/**
 * The 500 body, plus the slice of site chrome that can be rendered without a
 * database read. Shared by `app/error.tsx`; `app/global-error.tsx` deliberately
 * does not use it (see the note there).
 *
 * Chrome is rebuilt here rather than imported. `Header`, `Footer` and
 * `MobileBottomBar` are async server components that query Postgres — they
 * cannot be rendered inside a client error boundary at all, and a boundary that
 * needs the database is useless in exactly the case where the database is why
 * the page failed. What is reproduced is the part that carries the brand: the
 * logo, the maroon emergency block, the navy footer band, the sticky mobile
 * actions.
 *
 * Everything on this page works with JavaScript disabled. Next renders the
 * boundary on the server for a server-side error, so the copy and the emergency
 * number are in the HTML; the retry is an ordinary link to the current URL that
 * calls `reset()` only when scripting is available.
 *
 * Held to the tokens in `styles/globals.css`. No new colour and no second
 * typeface — spec §4 is still an unconfirmed placeholder block.
 */

const SHELL = "mx-auto max-w-360 px-4 sm:px-6 lg:px-25";

export function ErrorContent({
  reset,
  digest,
}: {
  /** Re-renders the failed segment. Absent when there is nothing to retry. */
  reset?: () => void;
  /** Next's server-side error handle. The only thing that makes a report actionable. */
  digest?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* --- Header ------------------------------------------------------- */}
      <header className="bg-background shadow-sm">
        <div className={`${SHELL} flex h-20 items-center gap-6 lg:h-26`}>
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

          {/* No primary nav: every link in it goes through the same rendering
              path that just failed, and offering a full menu invites a visitor
              to walk straight back into the error. The one action that always
              works is the phone. */}
          <Button
            asChild
            variant="accent"
            className="ml-auto hidden h-11 rounded-full px-5 text-base lg:inline-flex"
          >
            <a href={EMERGENCY_TEL_HREF}>
              Emergency
              <span className="sr-only">, call {EMERGENCY_LINE}</span>
            </a>
          </Button>
        </div>
      </header>

      {/* --- Body --------------------------------------------------------- */}
      {/* Bottom padding clears the sticky mobile bar, matching the marketing
          layout so the last element is never covered. */}
      <main id="main" className="flex-1 pb-20 lg:pb-0">
        <div className={`${SHELL} py-16 lg:py-24`}>
          <span
            aria-hidden
            className="flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent"
          >
            <TriangleAlert className="size-6" />
          </span>

          <p className="mt-6 text-sm font-medium tracking-[0.2em] text-accent uppercase">
            Error 500
          </p>

          <h1 className="mt-4 max-w-3xl text-4xl font-bold text-primary lg:text-5xl">
            This page did not load.
          </h1>

          {/*
            The reassurance is the point of this paragraph, same as on the 404.
            Someone reading a hospital error page wants to know whether they
            just broke their appointment. It claims nothing beyond what is true:
            a failed render does not touch the bookings table, and the booking
            handler treats the database write as the source of truth.
          */}
          <p className="mt-6 max-w-2xl text-lg text-foreground/80 lg:text-xl">
            The fault is on our side, not yours. Any appointment you have
            already booked is unaffected, and nothing you submitted has been
            lost.
          </p>

          <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
            {/*
              Declared first so it reads first on mobile and to a screen reader
              — the same ordering decision as the 404. Explicit grid placement
              moves it to the right rail on desktop without an order hack.
            */}
            <aside
              aria-labelledby="error-emergency-heading"
              className="rounded-xl bg-accent p-6 text-accent-foreground lg:col-start-2 lg:row-start-1 lg:sticky lg:top-8 lg:self-start"
            >
              <h2 id="error-emergency-heading" className="text-xl font-medium">
                Emergency
              </h2>
              <p className="mt-2 text-base text-accent-foreground/85">
                Our line is open 24 hours, every day, whatever this page is
                doing.
              </p>

              {/* The largest number on this page is the emergency line, not the
                  status code. That is the whole hierarchy decision here. */}
              <a
                href={EMERGENCY_TEL_HREF}
                className="mt-5 block rounded-md text-3xl font-bold underline-offset-4 hover:underline"
              >
                {EMERGENCY_LINE}
              </a>

              <Button
                asChild
                variant="secondary"
                className="mt-6 h-12 w-full rounded-full text-base"
              >
                <a href={EMERGENCY_TEL_HREF}>
                  <Phone aria-hidden />
                  Call now
                </a>
              </Button>
            </aside>

            <div className="lg:col-start-1 lg:row-start-1">
              <h2 className="text-xl font-medium text-primary">What to try</h2>
              <ul className="mt-4 list-disc space-y-3 pl-5 text-base leading-relaxed text-foreground/80 marker:text-accent">
                <li>
                  Reload the page. Most of these clear on a second attempt.
                </li>
                <li>
                  If it happens again, tell us what you were doing on the{" "}
                  <Link
                    href="/contact"
                    className="text-accent underline underline-offset-4 hover:no-underline"
                  >
                    contact page
                  </Link>
                  , quoting the reference below.
                </li>
                <li>For anything urgent, call the number on this page.</li>
              </ul>

              {/*
                A GET form with no `action`, so the retry still works with
                scripting off: the browser submits to the current URL, which is
                a plain reload. With JS the submit is intercepted and `reset()`
                re-renders the failed segment in place, which is faster and
                keeps scroll position. A bare `onClick` handler would have left
                a dead button for anyone without JS.
              */}
              <form
                onSubmit={(event) => {
                  if (!reset) return;
                  event.preventDefault();
                  reset();
                }}
                className="mt-10 flex flex-col gap-4 sm:flex-row"
              >
                <Button
                  type="submit"
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
              </form>

              <nav
                aria-labelledby="error-elsewhere"
                className="mt-12 border-t border-border pt-8"
              >
                <h2
                  id="error-elsewhere"
                  className="text-xl font-medium text-primary"
                >
                  Go somewhere else
                </h2>
                <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                  {[
                    ...NAV_ITEMS,
                    { label: "Book an appointment", href: "/book" },
                  ].map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        className="rounded-md text-base text-foreground/80 underline underline-offset-4 hover:text-accent hover:no-underline"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              {/* Quiet, selectable, and only rendered when Next actually
                  produced one. No stack trace and no error message reaches the
                  visitor; the digest is the handle that ties a support call to
                  the server-side log. */}
              {digest ? (
                <p className="mt-10 text-sm text-muted-foreground">
                  Reference for support:{" "}
                  <span className="font-medium text-foreground">{digest}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      {/* --- Footer ------------------------------------------------------- */}
      {/* The navy band from the site footer, cut down to what does not need a
          query: no branch directory, no newsletter form. */}
      <footer className="bg-primary text-primary-foreground">
        <div className={`${SHELL} py-12`}>
          <p className="text-2xl">Paelon Memorial</p>
          <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
            {[
              { label: "Contact", href: "/contact" },
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Terms of Service", href: "/terms" },
            ].map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="rounded-md text-base text-primary-foreground/85 underline-offset-4 hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-primary-foreground/85">
            © {new Date().getFullYear()} Paelon Memorial Hospital. All rights
            reserved.
          </p>
        </div>
      </footer>

      {/* --- Sticky mobile actions ---------------------------------------- */}
      {/* Two tiles rather than the site's three: WhatsApp needs a seeded number
          this boundary cannot read. Fixed, so it adds nothing to CLS, and the
          padding on <main> keeps it clear of the footer's last action. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <nav aria-label="Quick actions" className="flex">
          <a
            href={EMERGENCY_TEL_HREF}
            className="flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs font-medium text-accent"
          >
            <Phone className="size-5" aria-hidden />
            Call
          </a>
          <Link
            href="/book"
            className="flex flex-1 flex-col items-center justify-center gap-1 bg-primary py-3 text-xs font-medium text-primary-foreground"
          >
            <CalendarPlus className="size-5" aria-hidden />
            Book
          </Link>
        </nav>
      </div>
    </div>
  );
}
