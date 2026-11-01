/**
 * The content fixes `fix-demo-content.ts` makes, as data and pure functions so
 * they can be tested without a database.
 */

/**
 * The three `preview-*` layout fixtures (CLAUDE.md, "Live gaps"). They say
 * nothing about Paelon and are unpublished together: the post carries the
 * author's byline, so hiding one without the other leaves a half-fixture.
 * Unpublished, not deleted: the blog E2E specs can still reach the post in
 * draft mode, and nothing is lost if one is wanted back.
 */
export const PREVIEW_FIXTURES = [
  { kind: "author", slug: "preview-author", entityType: "authors", event: "authors.updated" },
  { kind: "post", slug: "preview-post-layout-fixture", entityType: "blog_posts", event: "blog.updated" },
  { kind: "testimonial", slug: "preview-testimonial-placeholder", entityType: "testimonials", event: "testimonials.updated" },
] as const;

export type PreviewFixture = (typeof PREVIEW_FIXTURES)[number];

/**
 * The About page's branch count, which became untrue when Francis ruled on
 * 2026-10-26 that Victoria Island is the only branch the site lists. Dropping
 * the clause rather than rewriting it to "one branch": the hospital's own site
 * lists three, so a smaller number would be a new claim, not a correction.
 */
export const BRANCH_COUNT_CLAUSE =
  "We now see patients at [three branches in Lagos](/locations), across ";
export const BRANCH_COUNT_REPLACEMENT = "We now see patients across ";

export type BranchCountFix =
  | { kind: "reworded"; body: string }
  /** Mentions three branches, but not in the original words: an editor changed it. */
  | { kind: "edited" }
  | { kind: "absent" };

/**
 * Drop the branch count from one Text block's Markdown body.
 *
 * Only the original sentence is rewritten. A body that still mentions three
 * branches in other words was edited in `/admin/about` since it was seeded, and
 * is reported rather than guessed at.
 */
export function fixBranchCount(body: string): BranchCountFix {
  if (body.includes(BRANCH_COUNT_CLAUSE)) {
    return {
      kind: "reworded",
      body: body.replaceAll(BRANCH_COUNT_CLAUSE, BRANCH_COUNT_REPLACEMENT),
    };
  }
  return /three branches/i.test(body) ? { kind: "edited" } : { kind: "absent" };
}
