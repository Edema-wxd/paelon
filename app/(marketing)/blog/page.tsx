import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BlogPostCard } from "@/components/site/blog-post-card";
import { PendingNote } from "@/components/site/pending-note";
import { PreferredSourceBadge } from "@/components/site/preferred-source-badge";
import { RouteLoader } from "@/components/site/route-loader";
import { BlogSearchForm } from "@/components/site/blog-search-form";
import {
  BLOG_CATEGORY_LABELS,
  getBlogPosts,
  getBlogPostsByTag,
  getBlogTags,
  searchBlogPosts,
  type BlogCategory,
} from "@/lib/content";
import { clientEnv } from "@/lib/env";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";

const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

const DESCRIPTION =
  "Health articles and seasonal guidance from the clinicians at Paelon Memorial Hospital.";

interface PageProps {
  searchParams: Promise<{ category?: string; tag?: string; q?: string }>;
}

/**
 * Trim and cap a search term.
 *
 * Capped because the term is echoed back into the page and into a tsquery; 120
 * characters is far more than any real search and well short of anything worth
 * sending to Postgres.
 */
function readQuery(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 120);
}

/**
 * Metadata varies with the filters, for two reasons that both matter to search.
 *
 * A search result page is `noindex`: `?q=` takes arbitrary input, so letting it
 * be crawled offers an unbounded set of thin, near-duplicate pages under a
 * hospital's domain. A tag page is the opposite — a real taxonomy with stable
 * membership — so it stays indexable and canonicalises to itself.
 *
 * The canonical for a search page points at `/blog`, so any link to a result
 * consolidates onto the index rather than splitting its signals.
 */
export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = readQuery(params.q);
  const tag = (params.tag ?? "").trim();

  const title =
    query.length > 0
      ? `Search: ${query}`
      : tag.length > 0
        ? `Articles tagged ${tag}`
        : "Health articles";

  const canonical =
    query.length > 0
      ? "/blog"
      : tag.length > 0
        ? `/blog?tag=${encodeURIComponent(tag)}`
        : "/blog";

  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical },
    ...(query.length > 0 ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: "website",
      url: new URL(canonical, siteUrl).toString(),
      siteName: "Paelon Memorial Hospital",
      title: `${title} | Paelon Memorial Hospital`,
      description: DESCRIPTION,
      images: OG_IMAGES,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Paelon Memorial Hospital`,
      description: DESCRIPTION,
      images: TWITTER_IMAGES,
    },
  };
}

/** Content changes through the Phase 2 CMS, which revalidates by tag. */
export const revalidate = 3600;

function isCategory(value: string | undefined): value is BlogCategory {
  return value !== undefined && value in BLOG_CATEGORY_LABELS;
}

/**
 * Blog index (spec §6).
 *
 * Filtering is URL state, not component state — a filtered view is a shareable
 * link, the page stays a server component, and no JavaScript is needed to use
 * it. Spec §2 rules out a state library for exactly this reason.
 *
 * Pagination is specified but deliberately not built yet: one post exists, and
 * a pager over a single page is dead UI. It goes in when the post count makes
 * it real, and the query layer already takes a limit.
 */
export default async function BlogIndexPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const active = isCategory(params.category) ? params.category : null;
  const tag = (params.tag ?? "").trim();
  const query = readQuery(params.q);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      {
        "@type": "ListItem",
        position: 2,
        name: "Health articles",
        item: new URL("/blog", siteUrl).toString(),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify output of a literal we construct — no user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div className="mx-auto max-w-360 px-4 py-16 sm:px-6 lg:px-25 lg:py-24">
        <h1 className="max-w-3xl text-4xl font-bold text-primary lg:text-5xl">
          Health articles
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-foreground/80 lg:text-xl">
          {DESCRIPTION}
        </p>

        <BlogSearchForm query={query} category={active} tag={tag} />

        <Suspense
          /* Keyed on the filters so a new search shows the loader again rather
             than holding the previous results on screen while the next query
             runs. */
          key={`${query}|${tag}|${active ?? ""}`}
          fallback={
            <RouteLoader
              label="Loading articles"
              description="Fetching the latest from Paelon Memorial Hospital."
              className="min-h-100"
            />
          }
        >
          <BlogResults query={query} tag={tag} active={active} />
        </Suspense>

        <PreferredSourceBadge className="mt-16 max-w-2xl" />
      </div>
    </>
  );
}

/**
 * Everything on the index that needs the database.
 *
 * Split out of the page so the heading and the search form paint from the first
 * flush while the queries are still running — `?q=` and `?tag=` make this route
 * server-rendered per request, so it is the one marketing route where the wait
 * is real. It is also why the section-level `loading.tsx` files are gone: a
 * `loading.tsx` above a dynamic segment makes Next flush the shell before the
 * page runs, which sent HTTP 200 ahead of every `notFound()` in
 * `blog/[slug]`, `services/[slug]`, `doctors/[slug]` and `locations/[slug]`. A
 * boundary inside the page reaches no sibling route, so the fallback survives
 * and the detail routes answer 404.
 */
async function BlogResults({
  query,
  tag,
  active,
}: {
  query: string;
  tag: string;
  active: BlogCategory | null;
}) {
  /**
   * One of three readers, not three filters layered on each other.
   *
   * A search is its own ranked query — reordering it by category would throw
   * away the ranking that makes it useful — and a tag filter is an indexed
   * lookup rather than something to do in JavaScript over every post. The
   * category chips still narrow whichever list came back, because that is a
   * cheap filter over a page of results and keeps the chips meaningful inside a
   * search.
   */
  const [allPosts, tags] = await Promise.all([
    query.length > 0
      ? searchBlogPosts(query)
      : tag.length > 0
        ? getBlogPostsByTag(tag)
        : getBlogPosts(),
    getBlogTags(),
  ]);

  const posts = active
    ? allPosts.filter((post) => post.category === active)
    : allPosts;

  // Only offer a filter that leads somewhere. A category chip returning an
  // empty list is a dead end the visitor cannot distinguish from a bug.
  const available = (
    Object.keys(BLOG_CATEGORY_LABELS) as BlogCategory[]
  ).filter((key) => allPosts.some((post) => post.category === key));

  // Chips keep whichever search or tag is active, so narrowing by category does
  // not silently discard what the visitor already asked for.
  const withFilters = (next: Record<string, string | null>): string => {
    const search = new URLSearchParams();
    const merged = { q: query, tag, category: active, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value) search.set(key, value);
    }
    const queryString = search.toString();
    return queryString.length > 0 ? `/blog?${queryString}` : "/blog";
  };

  return (
    <>
      {available.length > 0 ? (
        <nav aria-label="Filter articles by category" className="mt-10">
          <ul className="flex flex-wrap gap-3">
            <li>
              <CategoryLink
                href={withFilters({ category: null })}
                label="All articles"
                active={active === null}
              />
            </li>
            {available.map((key) => (
              <li key={key}>
                <CategoryLink
                  href={withFilters({ category: key })}
                  label={BLOG_CATEGORY_LABELS[key]}
                  active={active === key}
                />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {tags.length > 0 ? (
        <nav aria-label="Filter articles by tag" className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {tags.map((entry) => {
              const isActive = entry.tag.toLowerCase() === tag.toLowerCase();
              return (
                <li key={entry.tag}>
                  <Link
                    href={withFilters({
                      // Clicking the active tag clears it. A filter with no
                      // way out is a dead end on a touch device, where there
                      // is no obvious "back to everything".
                      tag: isActive ? null : entry.tag,
                      // A tag and a search term are alternative ways of
                      // narrowing, and the index reads one or the other —
                      // so choosing a tag drops the search rather than
                      // appearing to apply both.
                      q: null,
                    })}
                    aria-current={isActive ? "true" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none ${
                      isActive
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border text-foreground/80 hover:border-accent hover:text-primary"
                    }`}
                  >
                    {entry.tag}
                    <span className="text-xs opacity-70">{entry.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {posts.length > 0 ? (
        <>
          {/* Announced on filter changes; the heading below stays the anchor
              for anyone navigating by landmark. */}
          <p aria-live="polite" className="mt-10 text-sm text-muted-foreground">
            {posts.length} {posts.length === 1 ? "article" : "articles"}
            {query.length > 0 ? ` matching “${query}”` : ""}
            {tag.length > 0 && query.length === 0 ? ` tagged “${tag}”` : ""}
            {active ? ` in ${BLOG_CATEGORY_LABELS[active]}` : ""}
          </p>

          <ul className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <li key={post.id} className="flex">
                <div className="flex w-full">
                  {/* Directly under the page `h1`, so `h2` — see the card. */}
                  <BlogPostCard post={post} headingLevel={2} />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <PendingNote className="mt-10">
          {allPosts.length === 0 ? (
            <>
              {/* TODO(seed): real editorial content is outstanding — the only
                  post seeded is a layout fixture. See seed/README.md. */}
              Health articles from our clinicians are on the way.{" "}
              <Link
                href="/contact"
                className="text-accent underline underline-offset-4 hover:no-underline"
              >
                Contact us
              </Link>{" "}
              in the meantime.
            </>
          ) : query.length > 0 ? (
            <>
              Nothing matched “{query}”. Try a broader term, or{" "}
              <Link
                href="/blog"
                className="text-accent underline underline-offset-4 hover:no-underline"
              >
                browse every article
              </Link>
              .
            </>
          ) : tag.length > 0 ? (
            <>
              Nothing tagged “{tag}” yet.{" "}
              <Link
                href="/blog"
                className="text-accent underline underline-offset-4 hover:no-underline"
              >
                See all articles
              </Link>
              .
            </>
          ) : (
            <>
              Nothing in that category yet.{" "}
              <Link
                href="/blog"
                className="text-accent underline underline-offset-4 hover:no-underline"
              >
                See all articles
              </Link>
              .
            </>
          )}
        </PendingNote>
      )}
    </>
  );
}

function CategoryLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      // Colour is not the only signal: the active chip is also the one marked
      // `aria-current`, which is what a screen reader announces (spec §12).
      aria-current={active ? "true" : undefined}
      className={
        active
          ? "inline-flex rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
          : "inline-flex rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground/80 hover:border-accent hover:text-accent"
      }
    >
      {label}
    </Link>
  );
}
