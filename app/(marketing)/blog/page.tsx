import type { Metadata } from "next";
import Link from "next/link";

import { BlogPostCard } from "@/components/site/blog-post-card";
import { PendingNote } from "@/components/site/pending-note";
import { PreferredSourceBadge } from "@/components/site/preferred-source-badge";
import {
  BLOG_CATEGORY_LABELS,
  getBlogPosts,
  type BlogCategory,
} from "@/lib/content";
import { clientEnv } from "@/lib/env";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";

const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

const DESCRIPTION =
  "Health articles and seasonal guidance from the clinicians at Paelon Memorial Hospital.";

export const metadata: Metadata = {
  title: "Health articles",
  description: DESCRIPTION,
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    url: new URL("/blog", siteUrl).toString(),
    siteName: "Paelon Memorial Hospital",
    title: "Health articles | Paelon Memorial Hospital",
    description: DESCRIPTION,
    images: OG_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Health articles | Paelon Memorial Hospital",
    description: DESCRIPTION,
    images: TWITTER_IMAGES,
  },
};

/** Content changes through the Phase 2 CMS, which revalidates by tag. */
export const revalidate = 3600;

interface PageProps {
  searchParams: Promise<{ category?: string }>;
}

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
  const { category } = await searchParams;
  const active = isCategory(category) ? category : null;

  const allPosts = await getBlogPosts();
  const posts = active
    ? allPosts.filter((post) => post.category === active)
    : allPosts;

  // Only offer a filter that leads somewhere. A category chip returning an
  // empty list is a dead end the visitor cannot distinguish from a bug.
  const available = (
    Object.keys(BLOG_CATEGORY_LABELS) as BlogCategory[]
  ).filter((key) => allPosts.some((post) => post.category === key));

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

        {available.length > 0 ? (
          <nav aria-label="Filter articles by category" className="mt-10">
            <ul className="flex flex-wrap gap-3">
              <li>
                <CategoryLink
                  href="/blog"
                  label="All articles"
                  active={active === null}
                />
              </li>
              {available.map((key) => (
                <li key={key}>
                  <CategoryLink
                    href={`/blog?category=${key}`}
                    label={BLOG_CATEGORY_LABELS[key]}
                    active={active === key}
                  />
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {posts.length > 0 ? (
          <>
            {/* Announced on filter changes; the heading below stays the anchor
                for anyone navigating by landmark. */}
            <p aria-live="polite" className="mt-10 text-sm text-muted-foreground">
              {posts.length} {posts.length === 1 ? "article" : "articles"}
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

        <PreferredSourceBadge className="mt-16 max-w-2xl" />
      </div>
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
