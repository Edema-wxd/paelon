import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidateTag } from "next/cache";

import { blogPublishErrors } from "@/lib/admin/blog-publish";
import { writeAudit } from "@/lib/admin/audit";
import { duePosts, lagosDateOf } from "@/lib/blog/scheduled-publishing";
import { db } from "@/lib/db/client";
import { CACHE_TAGS } from "@/lib/db/queries/shared";
import { blogPostRelated, blogPosts } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { todayInLagos } from "@/lib/validation/primitives";

export interface ScheduledRunResult {
  /** The Lagos date the run judged "due" against. */
  today: string;
  published: { slug: string; title: string; date: string }[];
  /** Due but not published, and why. Still scheduled; the next run tries again. */
  held: { slug: string; title: string; date: string; reasons: string[] }[];
}

/**
 * Publish every scheduled post whose date has arrived (today or earlier, in
 * Lagos). The work behind `/api/jobs/publish-scheduled`, run at 08:00 WAT.
 *
 * ## Checked again at publish time
 *
 * A post passes the publish rules when it is scheduled, but a page it links to
 * can be unpublished in the days between. So each due post is run through
 * `blogPublishErrors` once more, exactly as Publish would, and a post that now
 * fails is **held**: left scheduled and unpublished, with an `audit_log` entry
 * naming the reasons, rather than going live with a broken link — a broken
 * link on a hospital page is found by a reader, not by anyone who can fix it.
 *
 * ## Several passes
 *
 * Two posts due the same day can link to each other, and the second is not
 * "published" until the first is. The loop repeats while a pass publishes
 * something, so their order does not decide whether both go out.
 *
 * ## Idempotent
 *
 * A published post is no longer scheduled, so a second run the same day finds
 * nothing to do. The update re-checks both flags, so two overlapping runs
 * cannot publish one post twice or resurrect one unpublished in between.
 */
export async function publishScheduledPosts(now: Date = new Date()): Promise<ScheduledRunResult> {
  const today = todayInLagos(now);

  const candidates = await db()
    .select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      title: blogPosts.title,
      body: blogPosts.body,
      publishedAt: blogPosts.publishedAt,
    })
    .from(blogPosts)
    .where(
      and(
        eq(blogPosts.scheduled, true),
        eq(blogPosts.published, false),
        isNull(blogPosts.deletedAt),
      ),
    );

  let pending = duePosts(candidates, today);
  const result: ScheduledRunResult = { today, published: [], held: [] };
  if (pending.length === 0) return result;

  const related = await relatedIdsByPost(pending.map((post) => post.id));
  const reasons = new Map<string, string[]>();

  let progressed = true;
  while (pending.length > 0 && progressed) {
    progressed = false;
    const stillPending: typeof pending = [];

    for (const post of pending) {
      const errors = await blogPublishErrors({
        published: true,
        body: post.body,
        relatedIds: related.get(post.id) ?? [],
        id: post.id,
      });

      if (errors) {
        reasons.set(post.id, Object.values(errors).flat());
        stillPending.push(post);
        continue;
      }

      const updated = await db()
        .update(blogPosts)
        .set({ published: true, scheduled: false, updatedAt: new Date() })
        .where(
          and(
            eq(blogPosts.id, post.id),
            eq(blogPosts.scheduled, true),
            eq(blogPosts.published, false),
          ),
        )
        .returning({ id: blogPosts.id });
      if (updated.length === 0) continue;

      progressed = true;
      reasons.delete(post.id);
      const date = lagosDateOf(post.publishedAt);
      result.published.push({ slug: post.slug, title: post.title, date });
      await writeAudit({
        userId: null,
        action: "blog.published_on_schedule",
        entityType: "blog_posts",
        entityId: post.id,
        metadata: { via: "job", slug: post.slug, date },
      });
    }

    pending = stillPending;
  }

  for (const post of pending) {
    const date = lagosDateOf(post.publishedAt);
    const why = reasons.get(post.id) ?? [];
    result.held.push({ slug: post.slug, title: post.title, date, reasons: why });
    await writeAudit({
      userId: null,
      action: "blog.schedule_held",
      entityType: "blog_posts",
      entityId: post.id,
      metadata: { via: "job", slug: post.slug, date, reasons: why },
    });
    logger.warn("job.publish_scheduled.held", { slug: post.slug, date, reasons: why });
  }

  // The same tag a Publish from the admin revalidates: /blog, the post, the
  // homepage card and the sitemap all read through it.
  if (result.published.length > 0) revalidateTag(CACHE_TAGS.blogPosts);

  return result;
}

/** Each post's chosen related posts, for the publish check. */
async function relatedIdsByPost(ids: readonly string[]): Promise<Map<string, string[]>> {
  const rows = await db()
    .select({ postId: blogPostRelated.postId, relatedId: blogPostRelated.relatedId })
    .from(blogPostRelated)
    .where(inArray(blogPostRelated.postId, [...ids]));

  const byPost = new Map<string, string[]>();
  for (const row of rows) {
    byPost.set(row.postId, [...(byPost.get(row.postId) ?? []), row.relatedId]);
  }
  return byPost;
}
