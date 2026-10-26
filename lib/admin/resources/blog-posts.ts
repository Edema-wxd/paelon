import { z } from "zod";

import type { Column, Field, ResourceConfig } from "@/lib/admin/resource-config";
import { BLOG_CATEGORY_LABELS } from "@/lib/blog/categories";
import { blogCategoryEnum, type BlogPost } from "@/lib/db/schema";
import { MIN_INTERNAL_LINKS, internalLinks } from "@/lib/blog/internal-links";
import { headingSkips, imagePlacementIssues } from "@/lib/markdown";

import {
  checkboxField,
  idListField,
  imageAltRule,
  imageFields,
  type ImageFieldNames,
  optionalPastDateField,
  orderField,
  requiredReferenceField,
  requiredText,
  slugField,
  tagsField,
} from "./fields";

/**
 * `/admin/blog` (spec §8, content type `blog_posts` in §5).
 *
 * ## The body is Markdown
 *
 * Decision D2: the stored source is a Markdown subset, parsed by
 * `lib/markdown.ts` and rendered by `components/site/article-body.tsx`. It
 * stays valid MDX so a compiler could be swapped in later, but no MDX compiler
 * is installed and none is on the approved list — running code out of a CMS
 * field is a risk with no benefit here. The editor is a textarea with a
 * toolbar and a preview (decision D1, `components/admin/markdown-field.tsx`),
 * and that preview is the *same* renderer the live article uses, so it cannot
 * quietly disagree with what readers get.
 *
 * ## Publishing is gated on the link rules, here and on the server
 *
 * Conversion baseline item 14 is a hard requirement, not a nice-to-have: a post
 * carries at least two contextual internal links, every one of them resolves,
 * and `related_slugs` names posts that exist and are published. Two of those
 * three are checked in this schema, so an editor sees them before a round trip
 * and sees them on the field they belong to:
 *
 *  - the **count**, which needs only the body text; and
 *  - **`published_at`**, because a post flagged published without one is
 *    invisible on `/blog` — `livePost()` filters on the column — and "Saved"
 *    with nothing on the site is the worst possible feedback.
 *
 * Whether each link *resolves* needs rows, so it cannot live in a schema the
 * client parses. It runs in `lib/admin/blog-publish.ts`, called through the
 * `validate` hook on this resource's entry in `./server.ts`, and reports on
 * `body` and `relatedIds` exactly as these rules do.
 *
 * All of it applies **only when the post is being published**. A draft is work
 * in progress; refusing to save one because the second link is not written yet
 * would make the rule something editors route around rather than meet.
 *
 * ## The hero image
 *
 * `hero_image_id` is a `media.id` (migration 0004), so the editor picks from
 * the library and the alt text is written on the media row — the shape `awards`
 * has used since 0002. It is the one content image the marketing site actually
 * renders today: the article template makes it the LCP element and the index
 * cards crop it to 16:9.
 */

/** `blog_posts.hero_image_id`, with its alt text on the media row. */
export const BLOG_HERO: ImageFieldNames = {
  id: "heroImageId",
  alt: "heroImageAlt",
  decorative: "heroImageDecorative",
};

/** `blog_post_related`: other posts shown at the foot of this one. */
export const BLOG_RELATED_FIELD = "relatedIds";

/**
 * The count half of baseline item 14, as a whole-object rule.
 *
 * On the object rather than on `body` because it spans two fields: the body
 * supplies the links and `published` decides whether the rule applies at all.
 * The issue is still filed on `body`, which is where the editor has to act.
 */
function internalLinkRule(ctx: { value: unknown; issues: z.core.$ZodRawIssue[] }): void {
  const value = ctx.value as Record<string, unknown>;
  if (value.published !== true) return;

  const body = String(value.body ?? "");
  const found = internalLinks(body).length;
  if (found >= MIN_INTERNAL_LINKS) return;

  ctx.issues.push({
    code: "custom",
    input: body,
    path: ["body"],
    message:
      found === 0
        ? `Add at least ${MIN_INTERNAL_LINKS} links to other pages on this site before publishing, written as [descriptive text](/path) in the sentences they belong to.`
        : `This post has ${found} internal link. Publishing needs at least ${MIN_INTERNAL_LINKS}, each written into the sentence it belongs to — not a “read more” list at the end.`,
  });
}

/**
 * A published post needs a publication date.
 *
 * Not a default: `/blog` orders by this column and `livePost()` requires it, so
 * a missing one means the post is flagged published and appears nowhere. Asking
 * is better than stamping `now()` behind the editor's back, which would date a
 * post written last month to today.
 */
function publishedAtRule(ctx: { value: unknown; issues: z.core.$ZodRawIssue[] }): void {
  const value = ctx.value as Record<string, unknown>;
  if (value.published !== true) return;
  if (value.publishedAt != null) return;

  ctx.issues.push({
    code: "custom",
    input: value.publishedAt,
    path: ["publishedAt"],
    message:
      "Give the post a publication date. Without one it stays off /blog even when published.",
  });
}

/**
 * Images that will not render, reported before the post goes live.
 *
 * The parser builds a figure only from a `media:` reference on a line of its
 * own; anything else stays literal text. That is visible in the preview and
 * easy to miss, and `![](media:oops)` shipped as words on a hospital page is
 * the kind of thing nobody notices until a reader does.
 *
 * Drafts are exempt, like every other publish rule here: an editor placing an
 * image mid-sentence is mid-edit, not mid-mistake.
 */
function imageRule(ctx: { value: unknown; issues: z.core.$ZodRawIssue[] }): void {
  const value = ctx.value as Record<string, unknown>;
  if (value.published !== true) return;

  const body = String(value.body ?? "");
  const issues = imagePlacementIssues(body);
  if (issues.length === 0) return;

  const inline = issues.filter((issue) => issue.reason === "inline").length;
  const other = issues.length - inline;

  const message =
    inline > 0 && other === 0
      ? `An image has to sit on a line of its own, with a blank line above and below it. ${inline === 1 ? "One image is" : `${inline} images are`} inside a sentence and will show as text. Use the Image button to place it.`
      : "An image reference will not render. Use the Image button to place images — a body references the media library by id, not by URL.";

  ctx.issues.push({ code: "custom", input: body, path: ["body"], message });
}

/**
 * Heading levels that skip a step.
 *
 * The title is the page's `h1`, so a body starts at `##`. Jumping `##` to
 * `####` leaves a gap, which is a WCAG 2.1 AA failure on a template CLAUDE.md
 * requires to pass — and unlike most of what the renderer handles, it cannot be
 * fixed downstream: only the author knows which level was meant.
 */
function headingRule(ctx: { value: unknown; issues: z.core.$ZodRawIssue[] }): void {
  const value = ctx.value as Record<string, unknown>;
  if (value.published !== true) return;

  const body = String(value.body ?? "");
  const skips = headingSkips(body);
  if (skips.length === 0) return;

  const first = skips[0];
  if (!first) return;

  ctx.issues.push({
    code: "custom",
    input: body,
    path: ["body"],
    message: `Heading levels cannot skip a step: “${first.text}” is an h${first.level} under an h${first.after}. Use ${"#".repeat(first.after + 1)} instead.`,
  });
}

export const blogPostSchema = z
  .object({
    title: requiredText("a title", 200),
    slug: slugField,
    excerpt: requiredText("an excerpt", 300),
    body: requiredText("the body", 50000),
    authorId: requiredReferenceField("an author"),
    category: z.enum(blogCategoryEnum.enumValues, "Choose a category."),
    tags: tagsField("tag", { maxItems: 12, maxLength: 60 }),
    publishedAt: optionalPastDateField("the publication date"),
    [BLOG_RELATED_FIELD]: idListField("related posts"),
    order: orderField,
    published: checkboxField,
    ...imageFields(BLOG_HERO),
  })
  .check(imageAltRule(BLOG_HERO))
  .check(internalLinkRule)
  .check(publishedAtRule)
  .check(imageRule)
  .check(headingRule);

export type BlogPostInput = z.output<typeof blogPostSchema>;

const FIELDS: readonly Field[] = [
  {
    type: "text",
    name: "title",
    section: "Post",
    label: "Title",
    required: true,
    maxLength: 200,
    hint: "The post’s only h1. The body’s own headings start at ##.",
  },
  {
    type: "slug",
    name: "slug",
    section: "Post",
    label: "Slug",
    from: "title",
    required: true,
    hint: "The last part of /blog/… . Generated from the title until you edit it; changing it on a published post breaks every existing link to the page.",
  },
  {
    type: "textarea",
    name: "excerpt",
    section: "Post",
    label: "Excerpt",
    required: true,
    rows: 3,
    maxLength: 300,
    hint: "One or two sentences. Used on /blog and as the page’s meta description, so it is capped at 300 characters.",
  },
  {
    type: "markdown",
    name: "body",
    section: "Body",
    label: "Body",
    required: true,
    rows: 24,
    figures: true,
    hint: "Markdown — the preview is the same renderer the live article uses. Headings start at ##, and tables and images are supported. Use the Image button to place a picture: it has to sit on a line of its own. Publishing needs at least two links to other pages on this site, written as [descriptive text](/path) inside the sentences they belong to. Every link must point at a page that exists.",
  },
  {
    type: "image",
    name: BLOG_HERO.id,
    section: "Hero image",
    label: "Hero image",
    altName: BLOG_HERO.alt,
    altLabel: "Hero image alt text",
    hint: "Optional. Shown at the top of the article and cropped to 16:9 on /blog. Alt text describes the picture for anyone who cannot see it — not the article, which the headline already names.",
  },
  {
    type: "reference",
    name: "authorId",
    section: "Byline and filing",
    width: "half",
    label: "Author",
    required: true,
    emptyLabel: "Choose an author",
    hint: "Whose byline the post carries. Create the author under Authors first if they are not listed.",
  },
  {
    type: "select",
    name: "category",
    section: "Byline and filing",
    width: "half",
    label: "Category",
    required: true,
    options: blogCategoryEnum.enumValues.map((value) => ({
      value,
      label: BLOG_CATEGORY_LABELS[value],
    })),
  },
  {
    type: "tags",
    name: "tags",
    section: "Byline and filing",
    label: "Tags",
    maxItems: 12,
    maxLength: 60,
    hint: "Press Enter after each. Tags appear as filter chips on /blog, and the /blog search matches them.",
  },
  {
    type: "date",
    name: "publishedAt",
    section: "Byline and filing",
    label: "Publication date",
    hint: "The date shown on the post and the one /blog sorts by. Required to publish; leave it blank while the post is a draft.",
  },
  {
    type: "multiselect",
    name: BLOG_RELATED_FIELD,
    section: "Read next",
    label: "Related posts",
    hint: "Shown under “Read next” at the foot of this post, up to three. Left empty, the site picks up to three other posts in the same category instead. Publishing needs every one chosen here to be published too — a draft would leave a link to a page that 404s.",
    emptyLabel: "No other posts to relate this one to yet.",
  },
  {
    type: "number",
    name: "order",
    label: "Order",
    min: 0,
    max: 9999,
    // Every public read sorts by `published_at` (`newestFirst` in
    // lib/db/queries/blog.ts); "Low numbers first" promised a control the site
    // does not have.
    hint: "Not used on the site: /blog lists posts newest first by publication date. Change the date to move a post.",
  },
  {
    type: "checkbox",
    name: "published",
    label: "Published",
    hint: "An unpublished post is gone from /blog and its own page 404s.",
  },
];

const COLUMNS: readonly Column<BlogPost>[] = [
  { label: "Title", sortKey: "title", value: (row) => row.title, primary: true },
  {
    label: "Category",
    sortKey: "category",
    value: (row) => BLOG_CATEGORY_LABELS[row.category],
  },
  {
    label: "Published on",
    sortKey: "publishedAt",
    // Spelled out rather than left blank, because "no date" is the reason a
    // post flagged published is not on /blog, and the list is where that gets
    // noticed.
    value: (row) =>
      row.publishedAt ? row.publishedAt.toISOString().slice(0, 10) : "No date",
  },
  { label: "Status", sortKey: "published", value: (row) => (row.published ? "Published" : "Draft") },
];

export const blogPostResource: ResourceConfig<BlogPost, typeof blogPostSchema> = {
  name: "blog",
  singular: "Post",
  plural: "Blog posts",
  description:
    "Long-form writing under /blog. Every post is published in Paelon’s name — write it from what the hospital and the author supplied, and never invent a medical claim to fill a paragraph.",
  emptyMessage: "No posts yet. /blog renders an empty index until one is published.",
  fields: FIELDS,
  columns: COLUMNS,
  schema: blogPostSchema,
  titleField: "title",
  deleteWarning:
    "/blog/<slug> is live. Deleting it makes that URL 404 for anyone holding the link, and takes the post out of the related-reading block on every post that points at it.",
};
