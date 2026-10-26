import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  authors,
  blogPostRelated,
  blogPosts,
  doctors,
  media,
  type BlogPost,
} from "@/lib/db/schema";

import {
  CACHE_TAGS,
  cachedRead,
  publicFilter,
  publicFilterWith,
  type ReadOptions,
} from "./shared";

/**
 * A post row with its byline and hero image resolved.
 *
 * `searchVector` is omitted: it is a generated column the database maintains
 * and no caller reads, and leaving it on the type would oblige every select
 * here to fetch a tsvector nothing looks at.
 *
 * The hero image arrives as four flat columns rather than a nested object
 * because that is what a left join returns. `lib/content.ts` is what folds
 * them into a `ContentImage` for templates.
 */
export interface BlogPostWithAuthor extends Omit<BlogPost, "searchVector"> {
  authorName: string;
  authorSlug: string;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  heroImageWidth: number | null;
  heroImageHeight: number | null;
}

/** One tag and how many published posts carry it. */
export interface BlogTagCount {
  tag: string;
  count: number;
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

/**
 * The joined select every reader here runs. Callers add filter and order.
 *
 * The media join is a LEFT join carrying `deleted_at IS NULL` in its own
 * condition rather than in the WHERE clause: a post whose hero image was
 * soft-deleted still has to appear on /blog, just without the figure. Moving
 * that test into WHERE would hide the post instead.
 */
function selectPosts() {
  return db()
    .select({
      ...blogPostColumns(),
      authorName: authors.name,
      authorSlug: authors.slug,
      heroImageUrl: media.url,
      heroImageAlt: media.alt,
      heroImageWidth: media.width,
      heroImageHeight: media.height,
    })
    .from(blogPosts)
    .innerJoin(authors, eq(authors.id, blogPosts.authorId))
    .leftJoin(
      media,
      and(eq(media.id, blogPosts.heroImageId), isNull(media.deletedAt)),
    );
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

/** The byline's full record, for the author card at the foot of a post. */
export interface PostAuthorRow {
  name: string;
  role: string;
  bio: string;
  headshotUrl: string | null;
  headshotAlt: string | null;
  headshotWidth: number | null;
  headshotHeight: number | null;
  /** Set only when the linked doctor profile is published, so it resolves. */
  doctorSlug: string | null;
}

async function selectPostAuthor(slug: string): Promise<PostAuthorRow | null> {
  const rows = await db()
    .select({
      name: authors.name,
      role: authors.role,
      bio: authors.bio,
      headshotUrl: media.url,
      headshotAlt: media.alt,
      headshotWidth: media.width,
      headshotHeight: media.height,
      doctorSlug: doctors.slug,
    })
    .from(authors)
    .leftJoin(media, and(eq(media.id, authors.headshotId), isNull(media.deletedAt)))
    .leftJoin(doctors, and(eq(doctors.id, authors.doctorId), publicFilter(doctors)))
    .where(and(eq(authors.slug, slug), isNull(authors.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * One author's card, by slug.
 *
 * Kept out of `selectPosts()` so the bio is read once, on the article, and not
 * carried by every card on `/blog`. No `published` filter: a byline shows
 * whenever its post does, which is what the Authors form says. Cached on the
 * `blog-posts` tag, which is the tag an author save revalidates
 * (`lib/admin/resources/server.ts`); the `doctors` tag is added so a doctor
 * being unpublished drops the profile link.
 */
export async function getPostAuthor(slug: string): Promise<PostAuthorRow | null> {
  const read = cachedRead(
    async (s: string) => selectPostAuthor(s),
    ["blog-post", "author"],
    [CACHE_TAGS.blogPosts, CACHE_TAGS.doctors],
  );
  return read(slug);
}

/**
 * Live posts whose editor chose `postId` under Related posts. Admin-only,
 * uncached: it feeds the post editor's "Where it appears" panel.
 */
export async function listPostsRelatingTo(
  postId: string,
): Promise<{ title: string }[]> {
  return db()
    .select({ title: blogPosts.title })
    .from(blogPostRelated)
    .innerJoin(blogPosts, eq(blogPosts.id, blogPostRelated.postId))
    .where(and(eq(blogPostRelated.relatedId, postId), livePost({})))
    .orderBy(blogPosts.title);
}

/**
 * How many live posts in `category`, other than `postId`, have no related
 * posts chosen — the posts whose "Read next" falls back to their category and
 * so might list `postId`. Admin-only, uncached.
 */
export async function countCategoryFallbackHosts(
  postId: string,
  category: BlogPost["category"],
): Promise<number> {
  const rows = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(blogPosts)
    .where(
      and(
        livePost({}),
        eq(blogPosts.category, category),
        sql`${blogPosts.id} <> ${postId}`,
        sql`not exists (select 1 from ${blogPostRelated} where ${blogPostRelated.postId} = ${blogPosts.id})`,
      ),
    );
  return rows[0]?.count ?? 0;
}

/**
 * Every post carrying `authorId`'s byline, drafts included, newest first.
 * Soft-deleted posts are left out: they hold the foreign key but no byline.
 * Admin-only, uncached — the author editor's panel and its delete guard.
 */
export async function listPostsByAuthor(
  authorId: string,
): Promise<{ title: string; published: boolean; publishedAt: Date | null }[]> {
  return db()
    .select({
      title: blogPosts.title,
      published: blogPosts.published,
      publishedAt: blogPosts.publishedAt,
    })
    .from(blogPosts)
    .where(and(eq(blogPosts.authorId, authorId), isNull(blogPosts.deletedAt)))
    .orderBy(desc(sql`coalesce(${blogPosts.publishedAt}, ${blogPosts.createdAt})`));
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
  post: Pick<BlogPost, "id" | "category">,
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

/**
 * Published posts matching a visitor's search terms, best match first.
 *
 * Two clauses, OR'd:
 *
 *  - the generated `search_vector`, through `websearch_to_tsquery`, which is
 *    the parser meant for untrusted input — it treats quotes as phrases and a
 *    leading `-` as negation, and cannot raise a syntax error the way
 *    `to_tsquery` does on a bare `&`; and
 *  - a case-insensitive match on any tag, because tags are deliberately not in
 *    the vector (see the column comment in lib/db/schema.ts).
 *
 * Ordered by `ts_rank` and then by date, so a title hit outranks a body hit and
 * two equally good hits read newest first.
 *
 * A query with no lexemes in it — punctuation, or stop words only — matches
 * nothing through the vector, which is the honest answer rather than the whole
 * index. The tag clause still applies.
 */
export async function searchPosts(
  query: string,
  options: ReadOptions = {},
): Promise<BlogPostWithAuthor[]> {
  const terms = query.trim();
  if (terms.length === 0) return [];

  const tsquery = sql`websearch_to_tsquery('english', ${terms})`;
  const tagPattern = `%${terms}%`;

  return selectPosts()
    .where(
      and(
        livePost(options),
        sql`(
          ${blogPosts.searchVector} @@ ${tsquery}
          or exists (
            select 1 from unnest(${blogPosts.tags}) as t
            where t ilike ${tagPattern}
          )
        )`,
      ),
    )
    .orderBy(
      desc(sql`ts_rank(${blogPosts.searchVector}, ${tsquery})`),
      newestFirst(options),
    );
}

/**
 * Published posts carrying a tag, newest first.
 *
 * An exact, case-insensitive match rather than the substring match `searchPosts`
 * uses: a tag chip is a precise filter, and `?tag=flu` must not also return
 * posts tagged `influenza-vaccine`.
 */
export async function getPostsByTag(
  tag: string,
  options: ReadOptions = {},
): Promise<BlogPostWithAuthor[]> {
  const wanted = tag.trim();
  if (wanted.length === 0) return [];

  return selectPosts()
    .where(
      and(
        livePost(options),
        sql`exists (
          select 1 from unnest(${blogPosts.tags}) as t
          where lower(t) = lower(${wanted})
        )`,
      ),
    )
    .orderBy(newestFirst(options));
}

/**
 * Every tag in use on a published post, with its post count.
 *
 * Most-used first, then alphabetical, so the chip row has a stable order that
 * does not reshuffle when two tags tie. Grouped on the lower-cased tag but
 * labelled with one of the spellings actually stored — `min()` picks the same
 * one every read, which keeps the chip and its `?tag=` link in agreement.
 */
export async function getTagCounts(
  options: ReadOptions = {},
): Promise<BlogTagCount[]> {
  const rows = await db()
    .select({
      tag: sql<string>`min(t)`.as("tag"),
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(sql`${blogPosts}, unnest(${blogPosts.tags}) as t`)
    .where(livePost(options))
    .groupBy(sql`lower(t)`)
    .orderBy(desc(sql`count(*)`), sql`min(t)`);

  return rows;
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
    heroImageId: blogPosts.heroImageId,
    authorId: blogPosts.authorId,
    category: blogPosts.category,
    tags: blogPosts.tags,
    publishedAt: blogPosts.publishedAt,
  };
}
