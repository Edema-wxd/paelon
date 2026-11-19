import type { MetadataRoute } from "next";

import { clientEnv } from "@/lib/env";
import { PRIVATE_ROUTE_PREFIXES } from "@/lib/indexing";

/**
 * robots.txt (master spec §11).
 *
 * Disallowing `/api` is hygiene, not a security control — it keeps crawlers out
 * of endpoints that have no crawlable content. Every endpoint still validates,
 * rate-limits, and authorises on its own.
 *
 * The thank-you routes are excluded because they are per-submission pages
 * with no business in an index. The list is `PRIVATE_ROUTE_PREFIXES`, shared
 * with the middleware that sends the same paths `X-Robots-Tag: noindex`: a
 * `Disallow` alone does not keep a linked URL out of the index.
 *
 * `/_next` is deliberately not disallowed. Google has to fetch the scripts and
 * styles to render a page; they carry a `noindex` header instead.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          ...PRIVATE_ROUTE_PREFIXES,
          // Blog search results. `?q=` takes arbitrary input, so crawling it
          // offers an unbounded set of thin, near-duplicate pages. The page
          // also sends `noindex` for the crawlers that ignore this, and `?tag=`
          // is deliberately absent — a tag page is a real taxonomy.
          "/blog?q=",
        ],
      },
    ],
    sitemap: new URL("/sitemap.xml", clientEnv.NEXT_PUBLIC_SITE_URL).toString(),
  };
}
