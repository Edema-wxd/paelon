/**
 * What search engines may index, in one place (spec §11, CLAUDE.md baseline 6).
 *
 * Three layers, because each one only reaches part of the site:
 *
 * - `robots.txt` (`app/robots.ts`) asks crawlers not to fetch a path. It does
 *   not keep a URL out of the index: a disallowed URL found through an inbound
 *   link can still be listed, and the crawler never gets to see a `noindex`.
 * - Page metadata (`robots: { index: false }`) emits `<meta name="robots">`,
 *   which exists only in HTML. JSON from `/api`, RSC payloads, scripts and
 *   images have nowhere to put it.
 * - `X-Robots-Tag` is the header form of the same directive and works on any
 *   response. `middleware.ts` sends it on private routes (`isPrivatePath`);
 *   `next.config.ts` sends it on what the middleware cannot see, from
 *   `noindexHeaderRules`.
 *
 * Keep this module free of imports: `next.config.ts` and the Edge middleware
 * both load it.
 */

/** For a response that is nobody's business: no index, no link discovery. */
export const NOINDEX_NOFOLLOW = "noindex, nofollow";

/** For a duplicate or non-document response whose links are harmless. */
export const NOINDEX = "noindex";

/**
 * Routes that are never public: the admin panel, every API endpoint, and the
 * per-submission thank-you pages (baseline item 1). Disallowed in robots.txt
 * and sent `X-Robots-Tag: noindex, nofollow` by middleware.
 *
 * `/corporate/thank-you` is listed before it is built, so the route is covered
 * the day it lands. An entry ending in `/` covers everything under it but not
 * the bare path; any other entry covers itself and everything under it.
 */
export const PRIVATE_ROUTE_PREFIXES = [
  "/admin",
  "/api",
  "/book/confirmed",
  "/contact/thank-you",
  "/corporate/thank-you",
  "/newsletter/",
] as const;

/** True when `pathname` is, or sits under, a `PRIVATE_ROUTE_PREFIXES` entry. */
export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_ROUTE_PREFIXES.some((prefix) =>
    prefix.endsWith("/")
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** The subset of Next's `headers()` rule shape these rules use. */
export interface HeaderRule {
  source: string;
  has?: ({ type: "header"; key: string; value?: string } | { type: "query"; key: string })[];
  headers: { key: string; value: string }[];
}

function noindexRule(
  source: string,
  value: string = NOINDEX,
  has?: HeaderRule["has"],
): HeaderRule {
  return { source, ...(has ? { has } : {}), headers: [{ key: "X-Robots-Tag", value }] };
}

/**
 * `next.config.ts` `headers()` rules for responses the middleware cannot tag.
 *
 * - RSC payloads: client navigation and prefetch fetch a page's serialised
 *   component tree with `RSC: 1` and a `?_rsc=` cache-buster. It is not a
 *   document, and Google does index `?_rsc=` URLs it finds, as thin duplicates
 *   of the real page. Next strips both markers from the request before
 *   middleware runs, so only a config rule can see them. Plain `noindex`: the
 *   page under its real URL stays indexable.
 * - `/_next/static`: JS chunks, CSS, fonts and build media. Skipped by the
 *   middleware matcher. `noindex` does not stop Google fetching them to render
 *   a page (only a robots.txt `Disallow` would, which is why `/_next` is
 *   deliberately not disallowed); it keeps a chunk URL out of search results.
 * - `/images/hmo-logo`: the insurers' own marks. Shown so a patient can see
 *   their plan is accepted, not for Paelon to rank in image search for another
 *   company's logo.
 * - `/fonts`: the Neo Tech `.woff2` files. `next/font/local` serves its own
 *   copies from `/_next/static/media`, but the sources in `public/fonts/` are
 *   reachable at their own URLs too. Licensed type, not content.
 *
 * Everything else under `/images/<kind>/` stays indexable: hero, service
 * cards, the About feature and the logo are the hospital's own editorial
 * images.
 *
 * With `siteNoindex` (the `SITE_NOINDEX=true` review-build gate) a catch-all
 * comes last so it overrides the narrower values: Next applies every matching
 * rule in order and the last one setting a key wins. The middleware already
 * covers dynamic responses; this is what covers the static files.
 *
 * @param siteNoindex whether the whole deployment is kept out of search
 */
export function noindexHeaderRules(siteNoindex: boolean): HeaderRule[] {
  const rules = [
    noindexRule("/:path*", NOINDEX, [{ type: "header", key: "rsc", value: "1" }]),
    noindexRule("/:path*", NOINDEX, [{ type: "query", key: "_rsc" }]),
    noindexRule("/_next/static/:path*"),
    noindexRule("/images/hmo-logo/:path*"),
    noindexRule("/fonts/:path*"),
  ];

  return siteNoindex ? [...rules, noindexRule("/:path*", NOINDEX_NOFOLLOW)] : rules;
}
