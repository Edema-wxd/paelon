"use client";

import { EMERGENCY_LINE, EMERGENCY_TEL_HREF } from "@/lib/emergency";
import "@/styles/globals.css";

/**
 * Last-resort boundary. Only runs when `app/layout.tsx` itself fails, which is
 * the one case `app/error.tsx` cannot catch — so it has to supply its own
 * `<html>` and `<body>`.
 *
 * Deliberately the smallest thing on the site: no seed data, no database, no
 * shared components, no icon set. Every import here is a way for the fallback
 * to fail with the thing it is meant to be falling back from. The two that are
 * allowed are `globals.css`, for the brand tokens, and `lib/emergency.ts`,
 * which is a pair of build-time string constants with no runtime behaviour —
 * cheaper than keeping a second copy of the emergency number in the codebase,
 * and a number that drifts out of date is the failure mode that actually
 * matters here.
 *
 * Colours are written as inline `var(--token, #fallback)` pairs rather than
 * Tailwind utilities, so the page still renders on brand if the utility layer
 * never arrives — the same stylesheet that failed to load is the one Tailwind
 * classes would depend on.
 *
 * Everything here works with JavaScript disabled: the retry is a GET form that
 * reloads the current URL, and the emergency line is an ordinary `tel:` link.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const navy = "var(--brand-navy, #223645)";
  const maroon = "var(--brand-maroon, #a02b3e)";
  const cream = "var(--brand-cream, #f9f7f2)";

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
          background: cream,
          color: "var(--foreground, #000000)",
          fontFamily:
            "var(--font-sans, 'Neo Tech', ui-sans-serif, system-ui, sans-serif)",
          lineHeight: 1.6,
        }}
      >
        <main style={{ width: "100%", maxWidth: "36rem" }}>
          {/*
            Served straight from /public rather than through `SiteImage`: the
            image pipeline is another import, and this file's whole job is to
            have none. Decorative — the hospital is named in the heading block
            directly below, so alt text here would only repeat it.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image
              is a whole runtime this boundary must not depend on, and the file
              is a static SVG served from /public. Width and height are set, so
              it costs nothing in CLS either. */}
          <img
            src="/images/logo/main.svg"
            alt=""
            width={138}
            height={64}
            style={{ display: "block", height: "3.5rem", width: "auto" }}
          />

          <p
            style={{
              margin: "2rem 0 0",
              fontSize: "0.875rem",
              fontWeight: 500,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: maroon,
            }}
          >
            Paelon Memorial Hospital
          </p>

          <h1
            style={{
              margin: "1rem 0 0",
              fontSize: "2.25rem",
              lineHeight: 1.2,
              fontWeight: 700,
              color: navy,
            }}
          >
            The site is temporarily unavailable.
          </h1>

          <p style={{ margin: "1.5rem 0 0", fontSize: "1.125rem" }}>
            We are working on it. Any appointment you have already booked is
            unaffected, and nothing you submitted has been lost.
          </p>

          {/* The emergency block, in the same maroon card the 404 and the 500
              use. It is the one thing on this page that has to be found in a
              hurry, so it sits above the retry rather than below it. */}
          <section
            aria-labelledby="global-error-emergency"
            style={{
              margin: "2.5rem 0 0",
              padding: "1.5rem",
              borderRadius: "var(--radius-xl, 16px)",
              background: maroon,
              color: cream,
            }}
          >
            <h2
              id="global-error-emergency"
              style={{ margin: 0, fontSize: "1.25rem", fontWeight: 500 }}
            >
              Emergency
            </h2>
            <p style={{ margin: "0.5rem 0 0", fontSize: "1rem" }}>
              Our line is open 24 hours, every day, whatever this page is doing.
            </p>
            <a
              href={EMERGENCY_TEL_HREF}
              style={{
                display: "inline-block",
                margin: "1.25rem 0 0",
                fontSize: "1.875rem",
                fontWeight: 700,
                color: cream,
                textDecoration: "none",
              }}
            >
              {EMERGENCY_LINE}
            </a>
          </section>

          {/*
            No `action`, so the browser submits a GET to the current URL — a
            plain reload that needs no JavaScript. With JS the submit is
            intercepted and `reset()` re-mounts the root layout.
          */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              reset();
            }}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              margin: "2rem 0 0",
            }}
          >
            <button
              type="submit"
              style={{
                padding: "1rem 2rem",
                borderRadius: "9999px",
                border: `1px solid ${navy}`,
                background: navy,
                color: cream,
                fontSize: "1rem",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                a full document load is the point: the root layout has just
                thrown, and a client-side <Link/> navigation would re-mount the
                same broken tree without fetching anything new. */}
            <a
              href="/"
              style={{
                padding: "1rem 2rem",
                borderRadius: "9999px",
                border: `1px solid ${maroon}`,
                color: maroon,
                fontSize: "1rem",
                textDecoration: "none",
              }}
            >
              Back to homepage
            </a>
          </form>

          {/* The digest only. The error message itself is never printed: it can
              carry a query fragment or a patient identifier, and a visitor can
              do nothing with it anyway. */}
          {error.digest ? (
            <p
              style={{
                margin: "2rem 0 0",
                fontSize: "0.875rem",
                color: "var(--muted-foreground, #5c5c5c)",
              }}
            >
              Reference for support:{" "}
              <span
                style={{ fontWeight: 500, color: "var(--foreground, #000)" }}
              >
                {error.digest}
              </span>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
