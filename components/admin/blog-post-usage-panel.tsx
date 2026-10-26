import { UsagePanel, type Usage } from "@/components/admin/usage-panel";
import {
  countCategoryFallbackHosts,
  getLatestPost,
  listPostsRelatingTo,
} from "@/lib/db/queries/blog";
import type { BlogPost } from "@/lib/db/schema";

/**
 * Where a post appears, from its saved state.
 *
 * A post is public only when it is published *and* dated (`livePost()` in
 * `lib/db/queries/blog.ts`), so a ticked Published box with no date is the
 * case this panel exists to make obvious: saved, flagged live, on no page.
 */
export async function BlogPostUsagePanel({ post }: { post: BlogPost }) {
  if (!post.published || post.publishedAt === null) {
    const reason = !post.published
      ? "Not shown: this post is a draft."
      : "Not shown: it has no publication date, so it stays off the site even though it is published.";
    return (
      <UsagePanel
        id="blog-post"
        usages={[{ state: "off", title: "Anywhere", detail: reason }]}
      />
    );
  }

  const [latest, referrers, fallbackHosts] = await Promise.all([
    getLatestPost(),
    listPostsRelatingTo(post.id),
    countCategoryFallbackHosts(post.id, post.category),
  ]);

  const fallback =
    fallbackHosts > 0
      ? ` It can also appear on ${fallbackHosts === 1 ? "1 other post" : `${fallbackHosts} other posts`} in its category with none chosen, which list their category’s newest three.`
      : "";

  const usages: Usage[] = [
    {
      state: "on",
      title: "Its own page",
      detail: `Shown at /blog/${post.slug}, and listed in the sitemap.`,
    },
    {
      state: "on",
      title: "Health articles index",
      detail: "Listed on /blog, newest first by publication date.",
    },
    latest?.id === post.id
      ? {
          state: "on",
          title: "Homepage",
          detail: "Shown as the latest article, because it has the newest publication date.",
        }
      : {
          state: "off",
          title: "Homepage",
          detail: "Not shown: the homepage features only the newest post.",
        },
    referrers.length > 0
      ? {
          state: "on",
          title: "Read next on other posts",
          detail: `Chosen as related on ${referrers.map((r) => `“${r.title}”`).join(", ")}.${fallback}`,
        }
      : fallbackHosts > 0
        ? {
            state: "on",
            title: "Read next on other posts",
            detail: `No post has chosen it as related.${fallback}`,
          }
        : {
            state: "off",
            title: "Read next on other posts",
            detail: "Not shown: no post has chosen it as related, and no other post in its category falls back to listing it.",
          },
    post.heroImageId
      ? {
          state: "on",
          title: "Share card",
          detail: "Its hero image is the picture shown when the link is shared.",
        }
      : {
          state: "off",
          title: "Share card",
          detail: "No hero image, so shared links show the hospital’s branded card.",
        },
  ];

  return <UsagePanel id="blog-post" usages={usages} />;
}
