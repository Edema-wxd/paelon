import { ArrowRight } from "lucide-react";
import { format } from "date-fns";
import Image from "next/image";
import Link from "next/link";

import { AssetPlaceholder } from "@/components/site/asset-placeholder";
import { BLOG_CATEGORY_LABELS, type BlogPost } from "@/lib/content";

/**
 * One post on the blog index.
 *
 * The whole card is not a link. A single link wrapping an image, a heading and
 * a category would be announced as one long, unhelpful label; spec §11 also
 * requires descriptive link text, so the heading carries the link and the card
 * carries the context.
 *
 * `headingLevel` exists because the same card sits at two different depths and
 * a heading level is a property of the page, not of the component. On
 * `/blog/[slug]` the grid sits under "Read next", an `h2`, so `h3` is right and
 * is the default. On `/blog` the grid sits directly under the page `h1`, where
 * `h3` skips a level — which CLAUDE.md forbids outright.
 */
export function BlogPostCard({
  post,
  headingLevel = 3,
}: {
  post: BlogPost;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const published = new Date(post.published_at);
  const validDate = !Number.isNaN(published.getTime());

  return (
    <article className="flex flex-col overflow-hidden rounded-xl bg-surface shadow-md">
      {/* Decorative: the card's own heading and excerpt already name the
          article, so describing the picture again would make a screen reader
          read every card twice (spec §12). The placeholder holds the same box,
          so a post gaining a hero image shifts nothing around it. */}
      {post.hero_image ? (
        // `fill` rather than the media row's width and height: the card crops
        // every hero to 16:9 regardless of what was uploaded, so the box is
        // already fixed by CSS and the intrinsic size would only be a ratio
        // hint the crop ignores. Nothing here guesses a dimension.
        <div className="relative aspect-video w-full">
          <Image
            src={post.hero_image.url}
            alt=""
            aria-hidden
            fill
            sizes="(min-width: 1024px) 24rem, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      ) : (
        <AssetPlaceholder
          label={`Illustration for ${post.title}`}
          className="aspect-video w-full"
          decorative
        />
      )}

      <div className="flex flex-1 flex-col gap-3 p-6">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="font-medium text-accent">
            {BLOG_CATEGORY_LABELS[post.category]}
          </span>
          {validDate ? (
            <time dateTime={post.published_at}>
              {format(published, "d MMMM yyyy")}
            </time>
          ) : null}
        </p>

        <Heading className="text-xl text-primary">
          <Link
            href={`/blog/${post.slug}`}
            className="rounded-sm underline-offset-4 hover:underline"
          >
            {post.title}
          </Link>
        </Heading>

        <p className="text-base text-foreground/80">{post.excerpt}</p>

        <p className="mt-auto pt-2 text-sm text-muted-foreground">
          By {post.author_name}
        </p>
      </div>

      {/* Repeats the heading link for anyone reaching for the obvious
          affordance. `aria-hidden` keeps it out of the accessibility tree so
          the same destination is not announced twice. */}
      <p aria-hidden className="px-6 pb-6">
        <Link
          href={`/blog/${post.slug}`}
          tabIndex={-1}
          className="inline-flex items-center gap-2 text-base text-accent underline underline-offset-4 hover:no-underline"
        >
          Read article
          <ArrowRight className="size-4" />
        </Link>
      </p>
    </article>
  );
}
