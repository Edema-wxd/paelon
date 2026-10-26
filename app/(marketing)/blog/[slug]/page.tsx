import { format } from "date-fns";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { ArticleBody } from "@/components/site/article-body";
import { AuthorCard } from "@/components/site/author-card";
import { BlogPostCard } from "@/components/site/blog-post-card";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { NewsletterPopup } from "@/components/site/newsletter-popup";
import { PreferredSourceBadge } from "@/components/site/preferred-source-badge";
import { ShareLinks } from "@/components/site/share-links";
import {
  BLOG_CATEGORY_LABELS,
  getBlogAuthor,
  getBlogPostBySlug,
  getBlogPosts,
  getBodyImages,
  getRelatedBlogPosts,
} from "@/lib/content";
import { clientEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { readingTimeMinutes } from "@/lib/markdown";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";
import { serializeJsonLd } from "@/lib/json-ld";

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
   * It also now carries the right status. An unknown slug used to answer HTTP
   * 200 with the not-found body — a soft 404, which search engines index as a
   * real page — because a `loading.tsx` above a dynamic segment makes Next
   * flush the shell before the page runs, sending the status before `notFound()`
   * is reached. The marketing `loading.tsx` boundaries were removed for that
   * reason; `/blog` keeps its loader as a `<Suspense>` inside the page, which
   * reaches no sibling route. Do not reintroduce a `loading.tsx` at or above
   * `app/(marketing)/` — it silently un-fixes this on four routes at once.
   */
  if (!post) notFound();

  const url = new URL(`/blog/${post.slug}`, siteUrl).toString();

  // The post's own hero is its share card when it has one (baseline item 7:
  // a share image per page); the branded card is the fallback, not the rule.
  const hero = post.hero_image;
  const ogImages = hero
    ? [
        {
          url: hero.url,
          width: hero.width ?? undefined,
          height: hero.height ?? undefined,
          alt: hero.alt || post.title,
        },
      ]
    : OG_IMAGES;
  const twitterImages = hero ? [hero.url] : TWITTER_IMAGES;

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
      images: ogImages,
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} | Paelon Memorial Hospital`,
      description: post.excerpt,
      images: twitterImages,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) notFound();

  const [related, bodyImages, author] = await Promise.all([
    getRelatedBlogPosts(post),
    getBodyImages(post.body),
    getBlogAuthor(post),
  ]);

  // Dimensions are what make the hero renderable: `next/image` needs both to
  // reserve the box, and this template's hero is the LCP element. Narrowed here
  // rather than asserted, so an older `media` row falls back to the placeholder
  // instead of failing the render.
  const hero =
    post.hero_image &&
    post.hero_image.width !== null &&
    post.hero_image.height !== null
      ? {
          url: post.hero_image.url,
          alt: post.hero_image.alt,
          width: post.hero_image.width,
          height: post.hero_image.height,
        }
      : null;
  const url = new URL(`/blog/${post.slug}`, siteUrl).toString();
  const published = new Date(post.published_at);
  const validDate = !Number.isNaN(published.getTime());
  const minutes = readingTimeMinutes(post.body);

  /**
   * `Article` JSON-LD (spec §11).
   *
   * `image` is the post's own hero or nothing at all — never the generic OG
   * fallback, which would misrepresent every post as illustrated. Absolute,
   * because a consumer of this markup has no base to resolve against.
   */
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.published_at,
    author: {
      "@type": "Person",
      name: post.author_name,
      ...(author?.role ? { jobTitle: author.role } : {}),
      ...(author?.doctor_slug
        ? { url: new URL(`/doctors/${author.doctor_slug}`, siteUrl).toString() }
        : {}),
    },
    publisher: {
      "@type": "Organization",
      name: "Paelon Memorial Hospital",
      url: siteUrl,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(post.hero_image ? { image: [post.hero_image.url] } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleLd) }}
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

          {/* The hero is the LCP candidate on this template, so it carries
              `priority` and its real dimensions. It is optional: a post
              without one goes straight from the byline to the body, rather
              than showing a grey "Illustration for …" box that reads as a
              broken image. */}
          {hero ? (
            <Image
              src={hero.url}
              alt={hero.alt}
              width={hero.width}
              height={hero.height}
              priority
              sizes="(min-width: 1024px) 80rem, 100vw"
              className="mt-10 aspect-[21/9] w-full rounded-xl object-cover"
            />
          ) : null}

          <div className="mt-12">
            <ArticleBody source={post.body} images={bodyImages} />
          </div>

          <footer className="mt-16 max-w-2xl border-t border-border pt-8">
            {author ? (
              <AuthorCard author={author} />
            ) : (
              <p className="text-base text-foreground/80">By {post.author_name}</p>
            )}

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
      {/* Opens when the reader reaches the end of the article and its "Read
          next" list, not part-way through the text. */}
      <NewsletterPopup
        heading="Get our next health article"
        body="Wellness tips and new health articles from Paelon Memorial Hospital, sent to your inbox."
      />
    </>
  );
}
