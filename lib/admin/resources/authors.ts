import { z } from "zod";

import type { Column, Field, ResourceConfig } from "@/lib/admin/resource-config";
import type { Author } from "@/lib/db/schema";

import {
  checkboxField,
  imageAltRule,
  imageFields,
  markdownWithoutHeadings,
  optionalReferenceField,
  orderField,
  requiredText,
  slugField,
  type ImageFieldNames,
} from "./fields";

/**
 * `/admin/authors` (spec §8, content type `authors` in §5).
 *
 * The byline half of the blog. An author row exists to be pointed at: every
 * public blog read `innerJoin`s it (`lib/db/queries/blog.ts`), and the post
 * page renders the name on the byline, in the `Article` JSON-LD and in the
 * "About the author" block at the foot.
 *
 * Two things about this type are not obvious from the columns:
 *
 *  1. **An author has no page of its own.** `slug` is there because every
 *     content type carries one (§5), and the §6 template list has no
 *     `/authors/[slug]`, so deleting one 404s nothing. Deleting one who still
 *     has posts is refused by the `beforeDelete` hook in `./server.ts`: the
 *     `on delete restrict` on `blog_posts.author_id` never fires, because
 *     every admin delete is soft.
 *  2. **`published` does not gate the byline.** The blog queries filter on the
 *     *post's* `published`, not the author's, so unpublishing an author hides
 *     nothing. It is left in place because the CRUD kit's list filter and the
 *     contributor's draft workflow are both built on it, and the hint says
 *     plainly what it does and does not do rather than implying a control that
 *     is not there.
 *
 * `headshot_id` is a `media.id` (migration 0004), which reconciled every
 * content image column onto `media` — the mismatch recorded in CLAUDE.md is
 * gone and the kit's image field works here unchanged.
 *
 * The article's "About the author" card (`components/site/author-card.tsx`)
 * renders the name, role, bio, headshot and — when the linked doctor profile is
 * published — a link to it. Before 2026-10-26 it rendered the name alone while
 * these hints promised the rest.
 */

/** `authors.doctor_id`: the doctor profile this byline belongs to, if any. */
export const AUTHOR_DOCTOR_FIELD = "doctorId";

/** `authors.headshot_id`, with its alt text on the media row. */
export const AUTHOR_HEADSHOT: ImageFieldNames = {
  id: "headshotId",
  alt: "headshotAlt",
  decorative: "headshotDecorative",
};

export const authorSchema = z
  .object({
    name: requiredText("the author’s name", 200),
    slug: slugField,
    role: requiredText("the author’s role", 200),
    bio: markdownWithoutHeadings("a bio", 4000),
    [AUTHOR_DOCTOR_FIELD]: optionalReferenceField("a doctor"),
    order: orderField,
    published: checkboxField,
    ...imageFields(AUTHOR_HEADSHOT),
  })
  .check(imageAltRule(AUTHOR_HEADSHOT));

export type AuthorInput = z.output<typeof authorSchema>;

const FIELDS: readonly Field[] = [
  {
    type: "text",
    name: "name",
    section: "Byline",
    width: "half",
    label: "Name",
    required: true,
    maxLength: 200,
    hint: "As it should appear on the byline. This is the name readers see.",
  },
  {
    type: "slug",
    name: "slug",
    section: "Byline",
    width: "half",
    label: "Slug",
    from: "name",
    required: true,
    hint: "Internal reference. Authors have no page of their own, so changing it breaks no links.",
  },
  {
    type: "text",
    name: "role",
    section: "Byline",
    label: "Role",
    required: true,
    maxLength: 200,
    hint: "Shown under the name in “About the author”, and given to search engines as their job title. What this person does at Paelon — use the title the hospital gave you, never a credential nobody supplied.",
  },
  {
    type: "markdown",
    name: "bio",
    section: "About the author",
    label: "Bio",
    required: true,
    rows: 8,
    headings: false,
    hint: "Shown in “About the author” at the foot of every post they wrote. A short paragraph or two; links are written as [text](/path) and must point at pages that exist.",
  },
  {
    type: "image",
    name: AUTHOR_HEADSHOT.id,
    section: "About the author",
    label: "Headshot",
    altName: AUTHOR_HEADSHOT.alt,
    altLabel: "Headshot alt text",
    hint: "Optional. Shown as a small round photo beside the name in “About the author”. Alt text names who is pictured.",
  },
  {
    type: "reference",
    name: AUTHOR_DOCTOR_FIELD,
    section: "Links",
    label: "Doctor profile",
    emptyLabel: "Not a doctor at Paelon",
    hint: "Optional. Adds a “View profile” link under the bio, while that doctor’s profile is published. Leave blank for a non-clinical author.",
  },
  {
    type: "number",
    name: "order",
    label: "Order",
    min: 0,
    max: 9999,
    hint: "Position in the Author list on the post form, low numbers first. Not shown on the site.",
  },
  {
    type: "checkbox",
    name: "published",
    label: "Published",
    hint: "Housekeeping only. An author’s byline is shown whenever one of their posts is published, whatever this is set to — unpublish the post to take the writing off the site.",
  },
];

const COLUMNS: readonly Column<Author>[] = [
  { label: "Author", sortKey: "name", value: (row) => row.name, primary: true },
  { label: "Role", sortKey: "role", value: (row) => row.role },
  { label: "Order", sortKey: "order", value: (row) => String(row.order) },
  { label: "Status", sortKey: "published", value: (row) => (row.published ? "Published" : "Draft") },
];

export const authorResource: ResourceConfig<Author, typeof authorSchema> = {
  name: "authors",
  singular: "Author",
  plural: "Authors",
  description:
    "Who writes the blog. Every post needs one, and the name, role and bio here are what readers see on the byline — write them from what the person and the hospital supplied.",
  emptyMessage:
    "No authors yet. A blog post cannot be created until there is at least one to attribute it to.",
  fields: FIELDS,
  columns: COLUMNS,
  schema: authorSchema,
  titleField: "name",
  deleteWarning:
    "Only possible once none of their posts remain — give each post another author, or delete it, first. Authors have no page of their own, so no link breaks.",
};
