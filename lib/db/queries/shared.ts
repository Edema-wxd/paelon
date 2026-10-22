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
 * How a content read should treat unpublished rows and the cache.
 *
 * Draft mode (spec §8 Content editing, decision C4) is a fact about the
 * *request*, not about a query, so the repository layer never reads the cookie
 * itself: `lib/content.ts` asks `draftMode()` once and threads the answer down.
 * That keeps every query here callable from a script, a seed run or a test,
 * where there is no request to read a cookie from.
 *
 * Only content reads take this. Bookings, submissions and anything
 * authenticated have no draft state to show and are never cached in the first
 * place.
 */
export interface ReadOptions {
  /**
   * Include unpublished rows and bypass `cachedRead`. Both halves matter: §5
   * forbids caching a read that depended on who was asking, and an editor
   * previewing a draft is exactly that.
   */
  draft?: boolean;
}

/**
 * `deleted_at IS NULL` — the one guard draft mode keeps.
 *
 * Preview shows the unpublished state, not the deleted one. A soft-deleted row
 * is content someone removed on purpose, and resurrecting it in a preview
 * would misrepresent what publishing would do.
 */
export function draftFilter(table: PublishableTable): SQL {
  return isNull(table.deletedAt);
}

/** `publicFilter`, or `draftFilter` when the caller is in draft mode. */
export function visibleFilter(
  table: PublishableTable,
  options: ReadOptions = {},
): SQL {
  return options.draft ? draftFilter(table) : publicFilter(table);
}

/** `visibleFilter` plus caller-supplied conditions. */
export function visibleFilterWith(
  table: PublishableTable,
  options: ReadOptions,
  ...extra: (SQL | undefined)[]
): SQL {
  return and(visibleFilter(table, options), ...extra) as SQL;
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
 * database. A draft-mode read is authenticated by the same rule, which is why
 * every getter below picks between the cached path and a direct one rather
 * than caching under a "draft" key part.
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
  siteSettings: "site-settings",
  about: "about",
} as const;
