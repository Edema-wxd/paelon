import termsJson from "@/content/legal/terms.json";
import {
  legalDocumentSchema,
  type LegalDocument,
  type LegalSection,
} from "@/lib/validation/legal";

/**
 * Legal document layer (master spec §6).
 *
 * Reads the files under `content/legal/`. This is the one content type that
 * does not come from Postgres: spec §6 specifies legal pages as files, they
 * have no table in `lib/db/schema.ts`, and spec §8's admin CRUD list does not
 * include them.
 *
 * The getter is `async` anyway, deliberately. `lib/content.ts` moved from seed
 * JSON to Postgres without a single component changing because every call site
 * already awaited it. When a Phase 2 `legal_pages` table lands, this file is
 * the only one that has to change.
 *
 * Documents are validated at module load rather than per request. A malformed
 * or wrongly-published legal document should fail the build, not render.
 */

export type { LegalDocument, LegalSection };

/** Slugs with a file behind them. `privacy` joins this when its draft lands. */
export const LEGAL_SLUGS = ["terms"] as const;

export type LegalSlug = (typeof LEGAL_SLUGS)[number];

const DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  terms: legalDocumentSchema.parse(termsJson),
};

/**
 * One legal document, or null when there is no file for that slug.
 *
 * Returns the document whether or not it is published — an unpublished legal
 * page renders a pending notice rather than a 404, because the footer links to
 * it on every page and a dead link there is worse than an honest empty one.
 * Callers are responsible for the `noindex` that goes with it.
 */
export async function getLegalDocument(
  slug: LegalSlug,
): Promise<LegalDocument | null> {
  return DOCUMENTS[slug] ?? null;
}

/**
 * Formats an ISO date for display, in the hospital's own locale.
 *
 * `en-NG` with an explicit UTC time zone: the stored value is a plain date, so
 * letting it render in the viewer's zone would shift it a day either side of
 * midnight and change the effective date of a legal document.
 */
export function formatEffectiveDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
