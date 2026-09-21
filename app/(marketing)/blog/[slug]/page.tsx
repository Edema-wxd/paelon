import { format } from "date-fns";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleBody } from "@/components/site/article-body";
import { AssetPlaceholder } from "@/components/site/asset-placeholder";
import { BlogPostCard } from "@/components/site/blog-post-card";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { PreferredSourceBadge } from "@/components/site/preferred-source-badge";
import { ShareLinks } from "@/components/site/share-links";
import {
  BLOG_CATEGORY_LABELS,
  getBlogPostBySlug,
  getBlogPosts,
  getRelatedBlogPosts,
} from "@/lib/content";
import { clientEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { readingTimeMinutes } from "@/lib/markdown";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";

const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Every published post is known at build time. New posts arrive via ISR.
 *
 * A database blip during a build must not fail the whole deploy. Returning no
 * params is safe: `dynamicParams` defaults to true, so every post is still
 * reachable — rendered on first request and cached from then on, rather than
 * prerendered. Slower first hit, shipped site. The sitemap degrades the same
 * way, for the same reason.
 */
export async function generateStaticParams() {
  try {
    return (await getBlogPosts()).map((post) => ({ slug: post.slug }));
  } catch (error) {
    logger.warn("blog.static_params_failed", { error });
    return [];
  }
}

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  /*
   * `notFound()` rather than a "not found" title, so the missing case is handled
   * the same way in both places and the page inherits the real not-found
   * metadata instead of a bespoke title.
   *
   * It does not fix the *status*, and neither would moving it: an unknown slug
   * still answers HTTP 200 with the not-found body — a soft 404, which search
   * engines index as a real page. The cause is `app/(marketing)/loading.tsx`
   * (and `blog/loading.tsx`): a `loading.tsx` above a dynamic segment makes Next
   * flush the shell before the page runs, and the status is already sent by the
   * time `notFound()` is reached. Verified — deleting those boundaries makes all
   * three detail routes 404 correctly, with `revalidate` left as it is, and the
   * trade is the route-level loading fallbacks. `/services/[slug]` and
   * `/locations/[slug]` are identical. Awaiting a decision on which to keep.
   */
  if (!post) notFound();

  const url = new URL(`/blog/${post.slug}`, siteUrl).toString();

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      url,
      siteName: "Paelon Memorial Hospital",
      title: `${post.title} | Paelon Memorial Hospital`,
      description: post.excerpt,
      publishedTime: post.published_at,
      authors: [post.author_name],
      images: OG_IMAGES,
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} | Paelon Memorial Hospital`,
      description: post.excerpt,
      images: TWITTER_IMAGES,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) notFound();

  const related = await getRelatedBlogPosts(post);
  const url = new URL(`/blog/${post.slug}`, siteUrl).toString();
  const published = new Date(post.published_at);
  const validDate = !Number.isNaN(published.getTime());
  const minutes = readingTimeMinutes(post.body);

  /**
   * `Article` JSON-LD (spec §11).
   *
   * `image` is omitted rather than pointed at the share card: an `Article`
   * image is meant to be the article's own, and the generic OG fallback would
   * misrepresent every post as illustrated. It goes in when `hero_image` does.
   */
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.published_at,
    author: { "@type": "Person", name: post.author_name },
    publisher: {
      "@type": "Organization",
      name: "Paelon Memorial Hospital",
      url: siteUrl,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(post.hero_image ? { image: [post.hero_image] } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <div className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-25 lg:py-16">
        <Breadcrumbs
          trail={[
            { label: "Health articles", href: "/blog" },
            { label: post.title, href: `/blog/${post.slug}` },
          ]}
        />

        <article className="mt-8">
          <header>
            <p className="text-sm font-medium tracking-[0.2em] text-accent uppercase">
              {BLOG_CATEGORY_LABELS[post.category]}
            </p>

            <h1 className="mt-4 max-w-3xl text-4xl font-bold text-primary lg:text-5xl">
              {post.title}
            </h1>

            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted-foreground">
              <span>By {post.author_name}</span>
              {validDate ? (
                <>
                  <span aria-hidden>·</span>
                  <time dateTime={post.published_at}>
                    {format(published, "d MMMM yyyy")}
                  </time>
                </>
              ) : null}
              <span aria-hidden>·</span>
              <span>{minutes} min read</span>
            </p>
          </header>

          {/* TODO(asset): no hero image is supplied for any post. The block
              holds the space so layout does not shift when one lands. */}
          <AssetPlaceholder
            label={`Illustration for ${post.title}`}
            className="mt-10 aspect-[21/9] w-full rounded-xl"
            decorative
          />

          <div className="mt-12">
            <ArticleBody source={post.body} />
          </div>

          <footer className="mt-16 max-w-2xl border-t border-border pt-8">
            <h2 className="text-xl text-primary">About the author</h2>
            <p className="mt-3 text-base text-foreground/80">
              {post.author_name}
            </p>

            <div className="mt-8">
              <ShareLinks title={post.title} url={url} />
            </div>

            <PreferredSourceBadge className="mt-10" />
          </footer>
        </article>

        {related.length > 0 ? (
          <section aria-labelledby="related-heading" className="mt-20">
            <h2 id="related-heading" className="text-3xl text-primary lg:text-4xl">
              Read next
            </h2>
            <ul className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <li key={item.id} className="flex">
                  <div className="flex w-full">
                    <BlogPostCard post={item} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
