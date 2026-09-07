/**
 * Phone helpers. Pure, dependency-free, and safe in a client bundle.
 *
 * Split out of `lib/content.ts` on purpose. That module reaches the database
 * through `lib/db/queries/*`, so importing it from a client component — an
 * error boundary above all — drags the Neon driver toward the browser bundle
 * for the sake of one string replace. `lib/content.ts` re-exports these so
 * every existing server-side import keeps working.
 */

/** Strip spaces and punctuation so a number can be used in a `tel:` href. */
export function toTelHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
