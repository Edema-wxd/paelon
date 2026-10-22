import type { ResourceName } from "@/lib/admin/resources";

/**
 * What a "Preview" button points at, and what counts as a legal preview target.
 *
 * Deliberately dependency-free — no database, no Drizzle, no Next — so the same
 * module serves the admin screen that renders the button, the route handler that
 * turns draft mode on, and the tests. Nothing here reads a cookie or a session;
 * `app/api/preview/route.ts` owns that half.
 */

/** Where draft mode is turned on. Also the `Disallow` entry in `app/robots.ts`. */
export const PREVIEW_ROUTE = "/api/preview";

/** Where it is turned off again, from the banner's exit link. */
export const PREVIEW_EXIT_ROUTE = "/api/preview/exit";

/** The fields a preview path can be built from. A saved row always has them. */
export interface PreviewRow {
  slug?: unknown;
}

interface PreviewTarget {
  /** The marketing route this row shows up on, or null when it cannot be built. */
  path: (row: PreviewRow) => string | null;
  /** Names the destination in the button's accessible description. */
  destination: string;
}

/** `row.slug` under `base`, or null when the row has no usable slug. */
function slugPath(base: string, row: PreviewRow): string | null {
  const slug = typeof row.slug === "string" ? row.slug.trim() : "";
  return slug === "" ? null : `${base}/${encodeURIComponent(slug)}`;
}

/**
 * The marketing page each content type is previewed on.
 *
 * Only types whose rows actually render somewhere are listed, and the entry is
 * the page a reader would meet the row on rather than a URL pattern that looks
 * plausible:
 *
 *  - `services`, `locations` and `doctors` own a detail route each.
 *  - `hmos` have no page of their own — `/hmo-check` is unbuilt (CLAUDE.md live
 *    gaps) — but every published provider appears in the homepage logo strip
 *    (`components/site/hmo-access-section.tsx`), so that is the honest target.
 *  - `awards` render as the timeline on `/about`, which is therefore where one
 *    is previewed.
 *  - `faqs` and `testimonials` are sections of other pages too, but of several
 *    of them: an FAQ shows on the homepage and on every service and location
 *    page, and a testimonial on the homepage and on the service it is attached
 *    to. There is no single honest target, so they have no button — previewing
 *    one means previewing a page it appears on.
 */
const PREVIEW_TARGETS: Partial<Record<ResourceName, PreviewTarget>> = {
  services: {
    path: (row) => slugPath("/services", row),
    destination: "the service page",
  },
  locations: {
    path: (row) => slugPath("/locations", row),
    destination: "the branch page",
  },
  doctors: {
    path: (row) => slugPath("/doctors", row),
    destination: "the doctor's profile",
  },
  hmos: {
    path: () => "/",
    destination: "the homepage, where the HMO list is shown",
  },
  awards: {
    path: () => "/about",
    destination: "the awards timeline on the About page",
  },
};

/**
 * Why a type has no Preview button, where the absence needs explaining.
 *
 * An edit screen with no button and no reason looks like a missing feature. A
 * type that renders as a section of one page is previewed by previewing that
 * page, and needs no note; a type that appears across several pages, or nowhere
 * at all, does.
 */
const PREVIEW_UNAVAILABLE: Partial<Record<ResourceName, string>> = {
  faqs: "FAQs show on the homepage and on every service and branch page. Preview one of those.",
  testimonials:
    "A quote shows on the homepage and on the service it is attached to. Preview one of those.",
};

/** The page this row is previewed on, or null when the type has no page yet. */
export function previewPathFor(
  resource: ResourceName,
  row: PreviewRow,
): string | null {
  return PREVIEW_TARGETS[resource]?.path(row) ?? null;
}

/** "the service page" — for the button's accessible description. */
export function previewDestinationFor(resource: ResourceName): string | null {
  return PREVIEW_TARGETS[resource]?.destination ?? null;
}

/** A sentence explaining why there is no Preview button, if one is warranted. */
export function previewUnavailableReason(resource: ResourceName): string | null {
  return PREVIEW_UNAVAILABLE[resource] ?? null;
}

/** The href that turns draft mode on and lands on `path`. */
export function previewHref(resource: ResourceName, path: string): string {
  const params = new URLSearchParams({ resource, path });
  return `${PREVIEW_ROUTE}?${params.toString()}`;
}

/**
 * Paths draft mode is never entered on. Preview shows marketing templates; the
 * panel and the API have no draft state, and `/_next` is build output.
 */
const NOT_PREVIEWABLE = ["/admin", "/api", "/_next"];

/**
 * `raw` as a path on this site, or null if it is anything else.
 *
 * This is the open-redirect guard. `/api/preview` sets a cookie and then sends
 * the browser wherever it was told, which is exactly the shape an attacker
 * wants: a link on the hospital's own domain that lands on theirs. So the
 * target is never used as given —
 *
 *  - it must be a relative path, which rules out `https://evil.example` and
 *    `javascript:` alike, since a string starting with `/` cannot carry a scheme;
 *  - `//evil.example` and `/\evil.example` are rejected explicitly, and so is
 *    anything that *normalises* into one: `/../\/evil.example` resolves to the
 *    pathname `////evil.example`, which is same-origin here and another host
 *    entirely once it is resolved against the site again. Both are read by
 *    browsers as protocol-relative URLs, which is the trick the first rule alone
 *    would miss;
 *  - control characters are rejected rather than stripped, because a newline in
 *    a `Location` header is a response-splitting attempt, not a typo;
 *  - what comes back is Next's own normalisation of the path, resolved against
 *    a throwaway origin and re-serialised. A `..` segment cannot climb out of
 *    the site, and nothing but the path, query and fragment survives.
 */
export function safePreviewPath(raw: string): string | null {
  if (raw === "" || raw.length > 512) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw, "https://preview.invalid");
  } catch {
    return null;
  }

  if (url.origin !== "https://preview.invalid") return null;

  const path = `${url.pathname}${url.search}${url.hash}`;

  // The same protocol-relative check again, against what normalisation
  // produced rather than what arrived.
  if (path.startsWith("//") || path.startsWith("/\\")) return null;

  if (
    NOT_PREVIEWABLE.some(
      (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
    )
  ) {
    return null;
  }

  return path;
}
