import type { MetadataRoute } from "next";

import { clientEnv } from "@/lib/env";

/**
 * robots.txt (master spec §11).
 *
 * Disallowing `/api` is hygiene, not a security control — it keeps crawlers out
 * of endpoints that have no crawlable content. Every endpoint still validates,
 * rate-limits, and authorises on its own.
 *
 * `/book/confirmed` and `/contact/thank-you` are excluded because they are
 * per-submission pages with no business in an index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/api",
          "/book/confirmed",
          "/contact/thank-you",
          "/newsletter/",
        ],
      },
    ],
    sitemap: new URL("/sitemap.xml", clientEnv.NEXT_PUBLIC_SITE_URL).toString(),
  };
}
