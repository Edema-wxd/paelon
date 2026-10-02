import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  authors,
  blogPostRelated,
  blogPosts,
  type BlogPost,
} from "@/lib/db/schema";

import {
  CACHE_TAGS,
  cachedRead,
  publicFilterWith,
  type ReadOptions,
} from "./shared";

export interface BlogPostWithAuthor extends BlogPost {
  authorName: string;
  authorSlug: string;
}

/**
 * A post is public only once it also has a `published_at`. `published` is the
 * editor's intent; `published_at` is the date the site sorts and displays by,
 * and a post without one has no place on a chronological index.
 *
 * Draft mode drops both halves — an unfinished post has neither — and keeps the
 * soft-delete guard.
 */
function livePost(options: ReadOptions) {
  return options.draft
    ? isNull(blogPosts.deletedAt)
    : publicFilterWith(blogPosts, isNotNull(blogPosts.publishedAt));
}

/**
 * Newest first, by the date the site displays.
 *
 * `published_at` is null on a post nobody has dated yet, and in draft mode
 * those are exactly the posts being previewed, so the order falls back to when
 * the row was created rather than leaving them to Postgres' NULLS FIRST.
 */
function newestFirst(options: ReadOptions) {
  return options.draft
    ? desc(sql`coalesce(${blogPosts.publishedAt}, ${blogPosts.createdAt})`)
    : desc(blogPosts.publishedAt);
}

/** The joined select every reader here runs. Callers add filter and order. */
function selectPosts() {
  return db()
    .select({
      ...blogPostColumns(),
      authorName: authors.name,
      authorSlug: authors.slug,
    })
    .from(blogPosts)
    .innerJoin(authors, eq(authors.id, blogPosts.authorId));
}

function selectPublishedPosts(
  limit: number | undefined,
  options: ReadOptions,
): Promise<BlogPostWithAuthor[]> {
  const query = selectPosts()
    .where(livePost(options))
    .orderBy(newestFirst(options));

  return limit === undefined ? query : query.limit(limit);
}

/** Published posts, newest first. Draft mode adds unpublished ones. */
export async function getPublishedPosts(
  limit?: number,
  options: ReadOptions = {},
): Promise<BlogPostWithAuthor[]> {
  if (options.draft) return selectPublishedPosts(limit, options);

  const read = cachedRead(
    async (n: number | undefined) => selectPublishedPosts(n, {}),
    ["blog-posts", "published"],
    [CACHE_TAGS.blogPosts],
  );
  return read(limit);
}

/** The most recent published post, or null. Homepage `RecentBlogCard`. */
export async function getLatestPost(
  options: ReadOptions = {},
): Promise<BlogPostWithAuthor | null> {
  const posts = await getPublishedPosts(1, options);
  return posts[0] ?? null;
}

async function selectPostBySlug(
  slug: string,
  options: ReadOptions,
): Promise<BlogPostWithAuthor | null> {
  const rows = await selectPosts()
    .where(and(livePost(options), eq(blogPosts.slug, slug)))
    .limit(1);
  return rows[0] ?? null;
}

/** One post by slug, or null. Draft mode also resolves an unpublished one. */
export async function getPostBySlug(
  slug: string,
  options: ReadOptions = {},
): Promise<BlogPostWithAuthor | null> {
  if (options.draft) return selectPostBySlug(slug, options);

  const read = cachedRead(
    async (s: string) => selectPostBySlug(s, {}),
    ["blog-post", "by-slug"],
    [CACHE_TAGS.blogPosts, CACHE_TAGS.blogPost(slug)],
  );
  return read(slug);
}

/** Published posts in one category, newest first. */
export async function getPostsByCategory(
  category: BlogPost["category"],
  options: ReadOptions = {},
): Promise<BlogPostWithAuthor[]> {
  return selectPosts()
    .where(and(livePost(options), eq(blogPosts.category, category)))
    .orderBy(newestFirst(options));
}

/**
 * Explicitly related posts, falling back to same-category posts when an editor
 * has not curated any — an empty "related reading" block is worse than a
 * reasonable automatic one.
 */
export async function getRelatedPosts(
  post: BlogPost,
  limit = 3,
  options: ReadOptions = {},
): Promise<BlogPostWithAuthor[]> {
  const links = await db()
    .select({ relatedId: blogPostRelated.relatedId })
    .from(blogPostRelated)
    .where(eq(blogPostRelated.postId, post.id));

  const ids = links.map((l) => l.relatedId);

  if (ids.length > 0) {
    return selectPosts()
      .where(and(livePost(options), inArray(blogPosts.id, ids)))
      .orderBy(newestFirst(options))
      .limit(limit);
  }

  const sameCategory = await getPostsByCategory(post.category, options);
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
