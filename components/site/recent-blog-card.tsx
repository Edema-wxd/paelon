import { ArrowRight } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

import { AssetPlaceholder } from "@/components/site/asset-placeholder";
import { getLatestBlogPost } from "@/lib/content";

/**
 * Most recent blog post (spec §6). Absent from the Figma export.
 *
 * Renders an empty state rather than nothing when no post is seeded, so the
 * section is visibly pending rather than silently missing during review.
 */
export function RecentBlogCard() {
  const post = getLatestBlogPost();

  return (
    <section
      aria-labelledby="latest-article-heading"
      className="bg-surface py-16 lg:py-24"
    >
      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-25">
        <h2
          id="latest-article-heading"
          className="text-3xl text-primary lg:text-4xl"
        >
          Latest from Paelon
        </h2>

        {post ? (
          <article className="mt-10 grid gap-8 overflow-hidden rounded-xl bg-background shadow-md lg:grid-cols-2">
            <AssetPlaceholder
              label={`Illustration for ${post.title}`}
              className="aspect-video w-full"
              decorative
            />
            <div className="flex flex-col justify-center gap-4 p-8">
              <p className="text-sm text-muted-foreground">
                <time dateTime={post.published_at}>
                  {format(new Date(post.published_at), "d MMMM yyyy")}
                </time>
              </p>
              <h3 className="text-2xl text-primary">{post.title}</h3>
              <p className="text-base text-foreground/80">{post.excerpt}</p>
              <Link
                href={`/blog/${post.slug}`}
                className="inline-flex items-center gap-2 text-base text-accent underline underline-offset-4 hover:no-underline"
              >
                Read {post.title}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </article>
        ) : (
          /* TODO(seed): no blog content exists yet — seed/blog-posts.json is
             empty. This empty state disappears the moment a post is added. */
          <p className="mt-10 rounded-xl bg-background p-8 text-base text-muted-foreground">
            Health articles from our clinicians are on the way.{" "}
            <Link
              href="/contact"
              className="text-accent underline underline-offset-4 hover:no-underline"
            >
              Contact us
            </Link>{" "}
            in the meantime.
          </p>
        )}
      </div>
    </section>
  );
}
