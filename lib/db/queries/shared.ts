import { and, isNull, eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { unstable_cache } from "next/cache";

/**
 * Shared read guard and caching helpers for the repository layer.
 *
 * The point of `publicFilter` is that forgetting it must be impossible rather
 * than merely discouraged: every public read composes it, so an unpublished
 * draft or a soft-deleted row cannot reach the marketing site through a query
 * someone wrote in a hurry.
 */

type PublishableTable = {
  published: PgColumn;
  deletedAt: PgColumn;
};

/** `published = true AND deleted_at IS NULL`. Every public content read uses this. */
export function publicFilter(table: PublishableTable): SQL {
  // `and` is only undefined for an empty argument list, which cannot happen here.
  return and(eq(table.published, true), isNull(table.deletedAt)) as SQL;
}

/** `publicFilter` plus caller-supplied conditions. */
export function publicFilterWith(
  table: PublishableTable,
  ...extra: (SQL | undefined)[]
): SQL {
  return and(publicFilter(table), ...extra) as SQL;
}

/**
 * Fallback revalidation window for cached content reads, in seconds.
 *
 * Phase 2 admin writes call `revalidateTag()`, which is the fast path. This is
 * the safety net: if a tag revalidation is ever missed, stale content self-heals
 * within the hour instead of persisting until the next deploy.
 */
export const CONTENT_REVALIDATE_SECONDS = 3600;

/**
 * Cache a public content read under entity-scoped tags.
 *
 * Never wrap bookings, submissions, newsletter, rate limiting, or anything
 * authenticated in this (master spec §5) — those reads must always hit the
 * database.
 *
 * Tags are wired now so each Phase 2 mutation is a one-line `revalidateTag`.
 */
export function cachedRead<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[],
  tags: string[],
): (...args: Args) => Promise<Result> {
  return unstable_cache(fn, keyParts, {
    tags,
    revalidate: CONTENT_REVALIDATE_SECONDS,
  });
}

/** Cache tag names, in one place so Phase 2 mutations cannot typo them. */
export const CACHE_TAGS = {
  services: "services",
  service: (slug: string) => `service:${slug}`,
  doctors: "doctors",
  doctor: (slug: string) => `doctor:${slug}`,
  locations: "locations",
  location: (slug: string) => `location:${slug}`,
  hmos: "hmos",
  hmo: (slug: string) => `hmo:${slug}`,
  testimonials: "testimonials",
  blogPosts: "blog-posts",
  blogPost: (slug: string) => `blog-post:${slug}`,
  awards: "awards",
  faqs: "faqs",
} as const;
