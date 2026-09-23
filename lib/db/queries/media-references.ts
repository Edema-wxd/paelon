import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

/**
 * Find content rows that still point at an UploadThing file.
 *
 * A CDN delete is permanent and immediate, so the panel checks before it fires:
 * removing a file that a published blog post still references turns a live
 * hospital page into one with a broken image, and nothing in the system would
 * report it.
 *
 * ## Why this matches on a substring
 *
 * The image columns are inconsistent about what they hold. `services.featured_image`
 * is documented as an UploadThing *key*; others were populated from seed files
 * with full CDN URLs. Matching the key as a substring covers both, and a key is
 * a UUID-prefixed filename, so a false positive is not a realistic concern.
 *
 * ## Why it is a raw query
 *
 * Nine tables and thirteen columns, three of which are Postgres arrays. Written
 * out in Drizzle this is forty lines of near-identical `or()` calls that have to
 * be edited every time a column is added. Here the shape is visible at a glance,
 * and the key is still parameterised — never interpolated.
 */

export interface MediaReference {
  table: string;
  column: string;
  rowId: string;
  label: string;
}

/**
 * Every place an image reference can live. Adding an image column to the schema
 * means adding a line here, or the panel will happily delete files it is using.
 */
const SCALAR_COLUMNS: Array<{ table: string; column: string; label: string }> = [
  { table: "services", column: "featured_image", label: "name" },
  { table: "doctors", column: "headshot", label: "name" },
  { table: "locations", column: "hero_image", label: "name" },
  { table: "hmos", column: "logo", label: "name" },
  { table: "testimonials", column: "avatar", label: "patient_name" },
  { table: "authors", column: "headshot", label: "name" },
  { table: "blog_posts", column: "hero_image", label: "title" },
];

/**
 * Tables that reference `media.id` by foreign key rather than holding a URL.
 *
 * These need a join to reach the key, so they cannot go through the substring
 * match above. As each content table migrates onto `media`, its entry moves
 * from `SCALAR_COLUMNS` to here.
 */
const FOREIGN_KEY_COLUMNS: Array<{ table: string; column: string; label: string }> = [
  { table: "awards", column: "logo_id", label: "name" },
  { table: "awards", column: "certificate_image_id", label: "name" },
];

const ARRAY_COLUMNS: Array<{ table: string; column: string; label: string }> = [
  { table: "services", column: "gallery_images", label: "name" },
  { table: "locations", column: "gallery_images", label: "name" },
];

/**
 * Rows referencing `key`. Empty means the file is safe to delete.
 *
 * Soft-deleted rows are included deliberately: a soft delete is reversible, so
 * a file one still points at is not orphaned yet.
 */
export async function findMediaReferences(
  key: string,
): Promise<MediaReference[]> {
  const pattern = `%${key}%`;
  const found: MediaReference[] = [];

  for (const { table, column, label } of SCALAR_COLUMNS) {
    const rows = await db().execute<{ id: string; label: string | null }>(sql`
      select id, ${sql.raw(label)}::text as label
      from ${sql.raw(table)}
      where ${sql.raw(column)} like ${pattern}
    `);

    for (const row of rows.rows) {
      found.push({ table, column, rowId: row.id, label: row.label ?? "(untitled)" });
    }
  }

  // An exact join on the key, not a substring: these columns hold a `media.id`.
  for (const { table, column, label } of FOREIGN_KEY_COLUMNS) {
    const rows = await db().execute<{ id: string; label: string | null }>(sql`
      select t.id, t.${sql.raw(label)}::text as label
      from ${sql.raw(table)} t
      join media m on m.id = t.${sql.raw(column)}
      where m.key = ${key}
    `);

    for (const row of rows.rows) {
      found.push({ table, column, rowId: row.id, label: row.label ?? "(untitled)" });
    }
  }

  for (const { table, column, label } of ARRAY_COLUMNS) {
    const rows = await db().execute<{ id: string; label: string | null }>(sql`
      select id, ${sql.raw(label)}::text as label
      from ${sql.raw(table)}
      where exists (
        select 1 from unnest(${sql.raw(column)}) as element
        where element like ${pattern}
      )
    `);

    for (const row of rows.rows) {
      found.push({ table, column, rowId: row.id, label: row.label ?? "(untitled)" });
    }
  }

  return found;
}
