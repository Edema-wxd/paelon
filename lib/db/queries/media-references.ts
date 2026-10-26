import { sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";

/**
 * Where each media row is used — for the library's "Used in" list and for the
 * check that refuses a delete.
 *
 * A CDN delete is permanent and immediate, so the panel checks before it fires:
 * removing a file that a published page still references turns a live hospital
 * page into one with a broken image, and nothing in the system would report it.
 *
 * ## Four kinds of reference
 *
 *  1. **Image columns** — a content row's `*_id` pointing at `media.id`.
 *  2. **Galleries** — join tables, labelled by the parent row.
 *  3. **Body figures** — `![alt](media:<id>)` inside a blog post body.
 *  4. **Page blocks** — `content_sections.data` (migration 0008): an Image
 *     block's `mediaId`, a Gallery's `mediaIds`, a Text block's figures.
 *
 * Kinds 3 and 4 live in text and JSON, so they are matched on the id as a
 * substring. That is exact rather than fuzzy: the id is a UUID, which cannot
 * occur by accident inside another one or in prose. Before 2026-10-26 only
 * kinds 1 and 2 were checked, so an image placed in a post body or a page
 * block could be deleted out from under a live page.
 *
 * Soft-deleted content rows count. A soft delete is reversible, so a file one
 * still points at is not orphaned yet — they are flagged, not skipped.
 *
 * ## Why it is a raw query
 *
 * Nine tables, two join tables, a text column and a jsonb column. Written out
 * in Drizzle this is a page of near-identical joins; here the shape is visible
 * at a glance, and every id is still a bound parameter — never interpolated.
 */

export interface MediaUsage {
  /** What kind of use, in words: "HMO logo", "Image in a post". */
  kind: string;
  /** Which row. Never a patient's name — see the testimonial entry. */
  label: string;
  /** The admin editor for that row. */
  href: string;
  /** The content row is soft-deleted, so the use is dormant, not live. */
  deleted: boolean;
}

/**
 * Every image column. Adding one to the schema means adding a line here, or
 * the library will happily delete files it is using.
 *
 * `label` is a SQL expression over the content row `t`. Testimonials are
 * labelled without the patient's name: the media library is open to
 * contributors, who have no access to testimonials (spec §8 Roles).
 */
const IMAGE_COLUMNS: Array<{
  table: string;
  column: string;
  kind: string;
  label: string;
  admin: string;
}> = [
  { table: "awards", column: "logo_id", kind: "Award logo", label: "t.name", admin: "awards" },
  { table: "awards", column: "certificate_image_id", kind: "Award certificate", label: "t.name", admin: "awards" },
  { table: "services", column: "featured_image_id", kind: "Service image", label: "t.name", admin: "services" },
  { table: "doctors", column: "headshot_id", kind: "Doctor headshot", label: "t.name", admin: "doctors" },
  { table: "locations", column: "hero_image_id", kind: "Branch image", label: "t.name", admin: "locations" },
  { table: "hmos", column: "logo_id", kind: "HMO logo", label: "t.name", admin: "hmos" },
  { table: "testimonials", column: "avatar_id", kind: "Testimonial photo", label: "'A testimonial'", admin: "testimonials" },
  { table: "authors", column: "headshot_id", kind: "Author headshot", label: "t.name", admin: "authors" },
  { table: "blog_posts", column: "hero_image_id", kind: "Post hero image", label: "t.title", admin: "blog" },
];

/** Galleries: join tables, labelled by the parent row. */
const GALLERIES: Array<{
  table: string;
  parent: string;
  parentKey: string;
  kind: string;
  admin: string;
}> = [
  { table: "service_gallery_images", parent: "services", parentKey: "service_id", kind: "Service gallery", admin: "services" },
  { table: "location_gallery_images", parent: "locations", parentKey: "location_id", kind: "Branch gallery", admin: "locations" },
];

interface UsageRow {
  media_id: string;
  row_id: string | null;
  label: string | null;
  deleted: boolean;
  [key: string]: unknown;
}

function idList(ids: readonly string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

/**
 * Every use of each media id, keyed by id. An id with no uses is absent.
 *
 * Batched: one query per reference kind for the whole page of the library,
 * not one per file.
 */
export async function findMediaUsage(
  ids: readonly string[],
): Promise<Map<string, MediaUsage[]>> {
  const found = new Map<string, MediaUsage[]>();
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return found;

  const list = idList(wanted);
  const add = (row: UsageRow, usage: Omit<MediaUsage, "deleted">) => {
    const entry = { ...usage, deleted: row.deleted };
    const existing = found.get(row.media_id);
    // Two blocks on one page, or a hero that is also a figure in the same
    // post body, are listed once per kind of use.
    if (existing?.some((use) => use.kind === entry.kind && use.href === entry.href)) return;
    if (existing) existing.push(entry);
    else found.set(row.media_id, [entry]);
  };

  // Independent reads, so they run together: thirteen round trips one after
  // another made the library noticeably slow to refresh after an upload.
  const [images, galleries, figures, blocks] = await Promise.all([
    Promise.all(
      IMAGE_COLUMNS.map((image) =>
        db().execute<UsageRow>(sql`
          select t.${sql.raw(image.column)} as media_id, t.id as row_id,
                 (${sql.raw(image.label)})::text as label,
                 t.deleted_at is not null as deleted
          from ${sql.raw(image.table)} t
          where t.${sql.raw(image.column)} in (${list})
        `),
      ),
    ),
    Promise.all(
      GALLERIES.map((gallery) =>
        db().execute<UsageRow>(sql`
          select g.media_id, p.id as row_id, p.name::text as label,
                 p.deleted_at is not null as deleted
          from ${sql.raw(gallery.table)} g
          join ${sql.raw(gallery.parent)} p on p.id = g.${sql.raw(gallery.parentKey)}
          where g.media_id in (${list})
        `),
      ),
    ),
    db().execute<UsageRow>(sql`
      select m.id as media_id, p.id as row_id, p.title as label,
             p.deleted_at is not null as deleted
      from media m
      join blog_posts p on strpos(p.body, 'media:' || m.id::text) > 0
      where m.id in (${list})
    `),
    // A page block belongs to a service, or to the About page when it has
    // none. Blocks are hard-deleted with their page's layout, so none is
    // dormant; a soft-deleted service still marks its blocks as such.
    db().execute<UsageRow>(sql`
      select m.id as media_id, s.service_id as row_id,
             coalesce(sv.name, 'About page') as label,
             coalesce(sv.deleted_at is not null, false) as deleted
      from media m
      join content_sections s on strpos(s.data::text, m.id::text) > 0
      left join services sv on sv.id = s.service_id
      where m.id in (${list})
    `),
  ]);

  IMAGE_COLUMNS.forEach((image, index) => {
    for (const row of images[index]?.rows ?? []) {
      add(row, {
        kind: image.kind,
        label: row.label ?? "(untitled)",
        href: `/admin/${image.admin}/${row.row_id}`,
      });
    }
  });

  GALLERIES.forEach((gallery, index) => {
    for (const row of galleries[index]?.rows ?? []) {
      add(row, {
        kind: gallery.kind,
        label: row.label ?? "(untitled)",
        href: `/admin/${gallery.admin}/${row.row_id}`,
      });
    }
  });

  for (const row of figures.rows) {
    add(row, {
      kind: "Image in a post",
      label: row.label ?? "(untitled)",
      href: `/admin/blog/${row.row_id}`,
    });
  }

  for (const row of blocks.rows) {
    add(row, {
      kind: "Page block",
      label: row.label ?? "(untitled)",
      href: row.row_id ? `/admin/services/${row.row_id}` : "/admin/about",
    });
  }

  return found;
}

/** Uses of one media id. Empty means the file is safe to delete. */
export async function findMediaReferences(id: string): Promise<MediaUsage[]> {
  return (await findMediaUsage([id])).get(id) ?? [];
}
