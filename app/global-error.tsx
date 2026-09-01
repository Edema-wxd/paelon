"use client";

import "@/styles/globals.css";

/**
 * Last-resort boundary. Only runs when `app/layout.tsx` itself fails, which is
 * the one case `app/error.tsx` cannot catch — so it has to supply its own
 * `<html>` and `<body>`.
 *
 * Deliberately the smallest thing on the site: no seed data, no icon set, no
 * shared components. Every import here is a way for the fallback to fail with
 * the thing it is meant to be falling back from. Brand tokens come from
 * `globals.css`, and the colours are set as inline `var(...)` values so the page
 * still reads correctly even if Tailwind's utility layer never arrives.
 *
 * There is no "try again" for a broken root layout, so the only actions offered
 * are ones that leave: a reload and the emergency line. The number is hardcoded
 * for the same reason — reaching into the seed layer is exactly the kind of
 * import that would take this page down with it.
 *
 * TODO(seed): +234 1234 5678 is the Figma placeholder carried by the footer and
 * the 404. A wrong emergency number is a safety issue, not a snag — confirm it
 * with Francis and update it here, in seed/locations.json, and nowhere else.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
          background: "var(--background, #f9f7f2)",
          color: "var(--foreground, #000)",
          fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
        }}
      >
        <main style={{ maxWidth: "34rem", width: "100%" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.875rem",
              fontWeight: 500,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--brand-maroon, #a02b3e)",
            }}
          >
            Paelon Memorial Hospital
          </p>

          <h1
            style={{
              margin: "1rem 0 0",
              fontSize: "2rem",
              lineHeight: 1.2,
              color: "var(--brand-navy, #223645)",
            }}
          >
            The site is temporarily unavailable.
          </h1>

          <p style={{ margin: "1.5rem 0 0", fontSize: "1.125rem", lineHeight: 1.6 }}>
            We are working on it. Any appointment you have already booked is
            unaffected. If you need care now, call our line — it is open 24
            hours, every day.
          </p>

          <a
            href="tel:+23412345678"
            style={{
              display: "inline-block",
              margin: "2rem 0 0",
              padding: "1rem 2rem",
              borderRadius: "9999px",
              background: "var(--brand-maroon, #a02b3e)",
              color: "var(--brand-cream, #f9f7f2)",
              fontSize: "1.25rem",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Call +234 1234 5678
          </a>

          <p style={{ margin: "2rem 0 0" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "9999px",
                border: "1px solid var(--brand-maroon, #a02b3e)",
                background: "transparent",
                color: "var(--brand-maroon, #a02b3e)",
                fontSize: "1rem",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              Reload the page
            </button>
          </p>

          {error.digest ? (
            <p
              style={{
                margin: "2rem 0 0",
                fontSize: "0.875rem",
                color: "var(--muted-foreground, #5c5c5c)",
              }}
            >
              Reference for support: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
