import type { MetadataRoute } from "next";

import { getPublishedPosts } from "@/lib/db/queries/blog";
import { getPublishedDoctors } from "@/lib/db/queries/doctors";
import { getPublishedLocations } from "@/lib/db/queries/locations";
import { getPublishedServices } from "@/lib/db/queries/services";
import { clientEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Dynamic sitemap (master spec §11).
 *
 * Content comes from the published-content queries, which already apply the
 * public filter — so an unpublished or soft-deleted page can never appear here.
 */

/** Static marketing routes, with their relative importance. */
const STATIC_ROUTES: [path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
  ["/", 1.0, "weekly"],
  ["/about", 0.8, "monthly"],
  ["/services", 0.9, "weekly"],
  ["/locations", 0.8, "monthly"],
  ["/doctors", 0.8, "monthly"],
  ["/for-corporates", 0.7, "monthly"],
  ["/hmo-check", 0.7, "monthly"],
  ["/blog", 0.7, "weekly"],
  ["/contact", 0.6, "monthly"],
  ["/book", 0.9, "monthly"],
  ["/privacy", 0.3, "yearly"],
  ["/terms", 0.3, "yearly"],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = clientEnv.NEXT_PUBLIC_SITE_URL;
  const url = (path: string) => new URL(path, base).toString();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map(
    ([path, priority, changeFrequency]) => ({
      url: url(path),
      lastModified: now,
      changeFrequency,
      priority,
    }),
  );

  // A database hiccup must not produce a 500 for a crawler. Degrading to the
  // static routes is far better than serving no sitemap at all.
  try {
    const [services, locations, doctors, posts] = await Promise.all([
      getPublishedServices(),
      getPublishedLocations(),
      getPublishedDoctors(),
      getPublishedPosts(),
    ]);

    for (const service of services) {
      entries.push({
        url: url(`/services/${service.slug}`),
        lastModified: service.updatedAt,
        changeFrequency: "monthly",
        priority: 0.8,
      });
    }

    for (const location of locations) {
      entries.push({
        url: url(`/locations/${location.slug}`),
        lastModified: location.updatedAt,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }

    for (const doctor of doctors) {
      entries.push({
        url: url(`/doctors/${doctor.slug}`),
        lastModified: doctor.updatedAt,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }

    for (const post of posts) {
      entries.push({
        url: url(`/blog/${post.slug}`),
        lastModified: post.publishedAt ?? post.updatedAt,
        changeFrequency: "yearly",
        priority: 0.5,
      });
    }
  } catch (error) {
    logger.warn("sitemap.dynamic_entries_failed", { error });
  }

  return entries;
}
