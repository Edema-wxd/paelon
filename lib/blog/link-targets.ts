import { and, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { blogPosts, locations, services } from "@/lib/db/schema";

import { publicFilter } from "@/lib/db/queries/shared";

/**
 * Does a path a post body links to actually resolve?
 *
 * Conversion baseline item 14: "A link to a route that does not exist is a
 * broken build, not a TODO." Phase 2 moves post bodies into a CMS field, so the
 * only place that check can still happen is the save — hence this module, which
 * `/admin/blog` calls before it lets a post be published.
 *
 * It is the server half of the rule. The count lives in
 * `lib/blog/internal-links.ts`, which is client-safe; this one reads rows, so
 * nothing in the admin form's import graph may touch it.
 *
 * ## What counts as resolving
 *
 * A path resolves when a reader clicking it gets a page. That is narrower than
 * "a route file exists":
 *
 *  - The **static** routes below are the built marketing pages, and only those.
 *    `/about`, `/for-corporates` and `/hmo-check` are specified in §6 and not
 *    built, so a link to one is refused today and starts resolving on its own
 *    the moment the page ships and is added here.
 *  - The **dynamic** routes resolve against `published` rows, because that is
 *    what their templates serve: an unpublished service 404s, so linking to one
 *    is the same broken link as a typo in the slug. A post additionally needs
 *    `published_at`, which is the column `/blog` sorts and filters on.
 *  - The `noindex` endpoints — `/book/confirmed`, `/contact/thank-you` and the
 *    other thank-you routes — are deliberately absent. They exist, but they are
 *    reached by POST → redirect, and sending a reader to one mid-article shows
 *    them a receipt for something they never submitted.
 *
 * Reads are uncached, unlike the marketing repositories. This runs inside a
 * save, and an editor told their link is broken because a cache is an hour
 * stale would have no way to find that out.
 */

/**
 * Built marketing routes with no slug of their own.
 *
 * Kept as a list rather than derived from the filesystem: `app/(marketing)`
 * also holds the routes above that a body must not link to, and a directory
 * walk cannot tell the difference. Add a page here when it ships (§6 still
 * lists `/about`, `/for-corporates` and `/hmo-check` as unbuilt).
 */
export const STATIC_ROUTES: ReadonlySet<string> = new Set([
  "/",
  "/blog",
  "/book",
  "/contact",
  "/locations",
  "/privacy",
  "/services",
  "/terms",
]);

/** A slugged route and the table whose published rows satisfy it. */
const DYNAMIC_PREFIXES = ["/services", "/locations", "/blog"] as const;

type DynamicPrefix = (typeof DYNAMIC_PREFIXES)[number];

/** `/services/cardiology` → `["/services", "cardiology"]`, or null. */
function splitDynamic(path: string): [DynamicPrefix, string] | null {
  for (const prefix of DYNAMIC_PREFIXES) {
    if (!path.startsWith(`${prefix}/`)) continue;
    const slug = path.slice(prefix.length + 1);
    // One segment only. `/blog/a/b` is not a route, and treating it as the
    // slug `a/b` would send a lookup for something that cannot exist.
    if (slug === "" || slug.includes("/")) return null;
    return [prefix, slug];
  }
  return null;
}

/**
 * The paths from `paths` that do not resolve, in the order they were given.
 *
 * Returns the unresolvable ones rather than the good ones because that is what
 * the caller puts in the error message — an editor needs the broken link named,
 * not a count.
 *
 * One query per prefix that was actually used, so a body linking only to
 * services costs one round trip and a body with no links costs none.
 */
export async function unresolvedPaths(
  paths: readonly string[],
): Promise<string[]> {
  const wanted = new Map<DynamicPrefix, Set<string>>();
  const unknown: string[] = [];

  for (const path of paths) {
    if (STATIC_ROUTES.has(path)) continue;

    const split = splitDynamic(path);
    if (!split) {
      unknown.push(path);
      continue;
    }

    const [prefix, slug] = split;
    const slugs = wanted.get(prefix) ?? new Set<string>();
    slugs.add(slug);
    wanted.set(prefix, slugs);
  }

  const live = new Map<DynamicPrefix, Set<string>>();
  await Promise.all(
    [...wanted].map(async ([prefix, slugs]) => {
      live.set(prefix, await publishedSlugs(prefix, [...slugs]));
    }),
  );

  for (const path of paths) {
    if (STATIC_ROUTES.has(path)) continue;
    const split = splitDynamic(path);
    if (!split) continue;

    const [prefix, slug] = split;
    if (!live.get(prefix)?.has(slug)) unknown.push(path);
  }

  // Deduplicated, so a path linked three times is one message rather than three.
  return [...new Set(unknown)];
}

/** Which of `slugs` name a row the public site will actually serve. */
async function publishedSlugs(
  prefix: DynamicPrefix,
  slugs: string[],
): Promise<Set<string>> {
  if (slugs.length === 0) return new Set();

  if (prefix === "/services") {
    const rows = await db()
      .select({ slug: services.slug })
      .from(services)
      .where(and(publicFilter(services), inArray(services.slug, slugs)));
    return new Set(rows.map((row) => row.slug));
  }

  if (prefix === "/locations") {
    const rows = await db()
      .select({ slug: locations.slug })
      .from(locations)
      .where(and(publicFilter(locations), inArray(locations.slug, slugs)));
    return new Set(rows.map((row) => row.slug));
  }

  const rows = await db()
    .select({ slug: blogPosts.slug })
    .from(blogPosts)
    .where(
      and(
        publicFilter(blogPosts),
        // `published` is the editor's intent; `published_at` is what /blog
        // sorts by, and a post without one is not on the index to be found.
        isNotNull(blogPosts.publishedAt),
        inArray(blogPosts.slug, slugs),
      ),
    );
  return new Set(rows.map((row) => row.slug));
}

/**
 * The ids from `ids` that are not published posts — the `related_slugs` half of
 * baseline item 14, which must "be populated with slugs that exist and resolve".
 *
 * Ids rather than slugs because the relation is stored in `blog_post_related`
 * as a pair of uuids (`lib/db/schema.ts`); the slug is what the template turns
 * them into. `/admin/blog` maps these back to titles for the message.
 */
export async function unpublishedRelatedIds(
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return [];

  const rows = await db()
    .select({ id: blogPosts.id })
    .from(blogPosts)
    .where(
      and(
        publicFilter(blogPosts),
        isNotNull(blogPosts.publishedAt),
        inArray(blogPosts.id, [...ids]),
      ),
    );

  const live = new Set(rows.map((row) => row.id));
  return ids.filter((id) => !live.has(id));
}

/** Titles for a set of post ids, for naming a broken relation in an error. */
export async function postTitles(
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const rows = await db()
    .select({ id: blogPosts.id, title: blogPosts.title })
    .from(blogPosts)
    .where(and(isNull(blogPosts.deletedAt), inArray(blogPosts.id, [...ids])));

  return new Map(rows.map((row) => [row.id, row.title]));
}
