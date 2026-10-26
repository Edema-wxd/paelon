import type { FieldErrors } from "@/lib/admin/action";
import { collectMediaIds, parseMarkdown } from "@/lib/markdown";
import { undescribedMedia, undescribedMessage } from "@/lib/admin/undescribed-media";
import { internalLinks, uniquePaths } from "@/lib/blog/internal-links";
import {
  postTitles,
  unpublishedRelatedIds,
  unresolvedPaths,
} from "@/lib/blog/link-targets";

/**
 * The half of Conversion baseline item 14 that needs rows, run when a post is
 * published.
 *
 * `lib/admin/resources/blog-posts.ts` holds the other half — the link count and
 * the publication date — in the Zod schema both sides parse, so an editor gets
 * those before a round trip. Whether a link *resolves* is a question about the
 * database, so it lands here, reached through the `validate` hook on the blog
 * entry in `lib/admin/resources/server.ts`.
 *
 * Two rules, reported on the field the editor has to act on:
 *
 *  - every internal link in the body points at a page that exists and is
 *    published (`body`);
 *  - every related post is itself published (`relatedIds`).
 *
 * Both are checked **only on publish**. A draft may link forward to a service
 * page that is still being written — that is normal, and refusing the save
 * would make editors write the link last, which is exactly how a "read more"
 * block bolted on at the end happens.
 *
 * ## Why this refuses rather than warns
 *
 * CLAUDE.md is explicit: "A link to a route that does not exist is a broken
 * build, not a TODO." In Phase 1 that was enforced by the build, because bodies
 * were seed files. Once a body is a CMS field, the save is the only moment left
 * where anyone can catch it — a broken link found after publication is found by
 * a reader.
 *
 * The messages name the offending link, because "a link is broken" in a
 * two-thousand-word body is not something an editor can act on.
 */

/** Named so the two rules read the same way at the call site. */
export interface BlogPublishInput {
  published: boolean;
  body: string;
  relatedIds: readonly string[];
  /** The post being saved, so it is not reported as its own related post. */
  id: string | null;
}

/** The form field each rule reports on. Kept here so the names cannot drift. */
const BODY_FIELD = "body";
const RELATED_FIELD = "relatedIds";

/**
 * Field errors blocking this publish, or `null` when there are none.
 *
 * Returns every broken link rather than the first: an editor who fixes one and
 * resubmits only to be told about the next has to guess how many are left.
 */
export async function blogPublishErrors(
  input: BlogPublishInput,
): Promise<FieldErrors | null> {
  if (!input.published) return null;

  const [bodyErrors, relatedErrors, undescribed] = await Promise.all([
    brokenBodyLinks(input.body),
    brokenRelatedPosts(input.relatedIds, input.id),
    // A figure's alt text comes from its media row, and nothing else checks
    // that one was written.
    undescribedMedia(collectMediaIds(parseMarkdown(input.body))),
  ]);

  const errors: FieldErrors = {};
  const bodyMessages = [
    ...bodyErrors,
    ...(undescribed.length > 0 ? [undescribedMessage(undescribed)] : []),
  ];
  if (bodyMessages.length > 0) errors[BODY_FIELD] = bodyMessages;
  if (relatedErrors.length > 0) errors[RELATED_FIELD] = relatedErrors;

  return Object.keys(errors).length > 0 ? errors : null;
}

async function brokenBodyLinks(body: string): Promise<string[]> {
  const links = internalLinks(body);
  if (links.length === 0) return [];

  const broken = await unresolvedPaths(uniquePaths(links));
  if (broken.length === 0) return [];

  return [
    `${broken.length === 1 ? "This link does" : "These links do"} not point at a page on this site: ${broken.join(", ")}. Link the nearest real page, or leave the sentence unlinked — do not invent a destination.`,
  ];
}

async function brokenRelatedPosts(
  ids: readonly string[],
  selfId: string | null,
): Promise<string[]> {
  // A post is excluded from its own picker, but the submission is form data and
  // the schema only checks that the ids are uuids.
  const others = ids.filter((id) => id !== selfId);
  if (others.length === 0) return [];

  const broken = await unpublishedRelatedIds(others);
  if (broken.length === 0) return [];

  // Named, not counted. An editor looking at a multi-select of a dozen titles
  // cannot work out which one the message means from a number.
  const titles = await postTitles(broken);
  const named = broken.map((id) => titles.get(id) ?? "a post that no longer exists");

  return [
    `Related reading would link to ${named.length === 1 ? "a post that is not published" : "posts that are not published"}: ${named.join(", ")}. Publish ${named.length === 1 ? "it" : "them"} first, or take ${named.length === 1 ? "it" : "them"} off this list.`,
  ];
}
