import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  authors,
  blogPostRelated,
  blogPosts,
  type BlogPost,
} from "@/lib/db/schema";

import { CACHE_TAGS, cachedRead, publicFilterWith } from "./shared";

export interface BlogPostWithAuthor extends BlogPost {
  authorName: string;
  authorSlug: string;
}

/**
 * A post is public only once it also has a `published_at`. `published` is the
 * editor's intent; `published_at` is the date the site sorts and displays by,
 * and a post without one has no place on a chronological index.
 */
function livePost() {
  return publicFilterWith(blogPosts, isNotNull(blogPosts.publishedAt));
}

/** Published posts, newest first. */
export async function getPublishedPosts(
  limit?: number,
): Promise<BlogPostWithAuthor[]> {
  const read = cachedRead(
    async (n: number | undefined) => {
      const query = db()
        .select({
          ...blogPostColumns(),
          authorName: authors.name,
          authorSlug: authors.slug,
        })
        .from(blogPosts)
        .innerJoin(authors, eq(authors.id, blogPosts.authorId))
        .where(livePost())
        .orderBy(desc(blogPosts.publishedAt));

      return n === undefined ? query : query.limit(n);
    },
    ["blog-posts", "published"],
    [CACHE_TAGS.blogPosts],
  );
  return read(limit);
}

/** The most recent published post, or null. Homepage `RecentBlogCard`. */
export async function getLatestPost(): Promise<BlogPostWithAuthor | null> {
  const posts = await getPublishedPosts(1);
  return posts[0] ?? null;
}

/** One published post by slug, or null. */
export async function getPostBySlug(
  slug: string,
): Promise<BlogPostWithAuthor | null> {
  const read = cachedRead(
    async (s: string) => {
      const rows = await db()
        .select({
          ...blogPostColumns(),
          authorName: authors.name,
          authorSlug: authors.slug,
        })
        .from(blogPosts)
        .innerJoin(authors, eq(authors.id, blogPosts.authorId))
        .where(and(livePost(), eq(blogPosts.slug, s)))
        .limit(1);
      return rows[0] ?? null;
    },
    ["blog-post", "by-slug"],
    [CACHE_TAGS.blogPosts, CACHE_TAGS.blogPost(slug)],
  );
  return read(slug);
}

/** Published posts in one category, newest first. */
export async function getPostsByCategory(
  category: BlogPost["category"],
): Promise<BlogPostWithAuthor[]> {
  return db()
    .select({
      ...blogPostColumns(),
      authorName: authors.name,
      authorSlug: authors.slug,
    })
    .from(blogPosts)
    .innerJoin(authors, eq(authors.id, blogPosts.authorId))
    .where(and(livePost(), eq(blogPosts.category, category)))
    .orderBy(desc(blogPosts.publishedAt));
}

/**
 * Explicitly related posts, falling back to same-category posts when an editor
 * has not curated any — an empty "related reading" block is worse than a
 * reasonable automatic one.
 */
export async function getRelatedPosts(
  post: BlogPost,
  limit = 3,
): Promise<BlogPostWithAuthor[]> {
  const links = await db()
    .select({ relatedId: blogPostRelated.relatedId })
    .from(blogPostRelated)
    .where(eq(blogPostRelated.postId, post.id));

  const ids = links.map((l) => l.relatedId);

  if (ids.length > 0) {
    return db()
      .select({
        ...blogPostColumns(),
        authorName: authors.name,
        authorSlug: authors.slug,
      })
      .from(blogPosts)
      .innerJoin(authors, eq(authors.id, blogPosts.authorId))
      .where(and(livePost(), inArray(blogPosts.id, ids)))
      .orderBy(desc(blogPosts.publishedAt))
      .limit(limit);
  }

  const sameCategory = await getPostsByCategory(post.category);
  return sameCategory.filter((p) => p.id !== post.id).slice(0, limit);
}

/** Column map for the joined selects above. */
function blogPostColumns() {
  return {
    id: blogPosts.id,
    createdAt: blogPosts.createdAt,
    updatedAt: blogPosts.updatedAt,
    deletedAt: blogPosts.deletedAt,
    published: blogPosts.published,
    order: blogPosts.order,
    createdByUserId: blogPosts.createdByUserId,
    title: blogPosts.title,
    slug: blogPosts.slug,
    excerpt: blogPosts.excerpt,
    body: blogPosts.body,
    heroImage: blogPosts.heroImage,
    authorId: blogPosts.authorId,
    category: blogPosts.category,
    tags: blogPosts.tags,
    publishedAt: blogPosts.publishedAt,
  };
}
