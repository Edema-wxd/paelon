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
 * ## Why every match is exact
 *
 * It did not used to be. The image columns held a mix of UploadThing keys and
 * full CDN URLs, so this matched the key as a substring to cover both.
 * Migration 0004 moved every one of them onto `media.id`, so the question is
 * now a join: either a row points at the media row or it does not. A substring
 * match over text columns cannot be wrong in a way that is safe here — a near
 * miss means either a refused delete nobody can explain, or a permitted one
 * that breaks a live page.
 *
 * ## Why it is a raw query
 *
 * Nine tables and eleven references, two of them through join tables. Written
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
 *
 * Every one of them is now a `media.id`, reached by join — migration 0004
 * finished the move that 0002 started for `awards`, so the substring match the
 * text columns needed is gone and with it the chance of a near miss.
 */
const FOREIGN_KEY_COLUMNS: Array<{ table: string; column: string; label: string }> = [
  { table: "awards", column: "logo_id", label: "name" },
  { table: "awards", column: "certificate_image_id", label: "name" },
  { table: "services", column: "featured_image_id", label: "name" },
  { table: "doctors", column: "headshot_id", label: "name" },
  { table: "locations", column: "hero_image_id", label: "name" },
  { table: "hmos", column: "logo_id", label: "name" },
  { table: "testimonials", column: "avatar_id", label: "patient_name" },
  { table: "authors", column: "headshot_id", label: "name" },
  { table: "blog_posts", column: "hero_image_id", label: "title" },
];

/**
 * Galleries, which are join tables rather than columns on the content row.
 *
 * `label` names the column on the *parent* table, reached through `parentKey`,
 * so a blocked delete can still say which branch or service is using the file
 * rather than printing a join-row id at the editor.
 */
const JOIN_TABLES: Array<{
  table: string;
  parent: string;
  parentKey: string;
  label: string;
}> = [
  {
    table: "service_gallery_images",
    parent: "services",
    parentKey: "service_id",
    label: "name",
  },
  {
    table: "location_gallery_images",
    parent: "locations",
    parentKey: "location_id",
    label: "name",
  },
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
  const found: MediaReference[] = [];

  // An exact join on the key: every one of these columns holds a `media.id`.
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

  for (const { table, parent, parentKey, label } of JOIN_TABLES) {
    const rows = await db().execute<{ id: string; label: string | null }>(sql`
      select p.id, p.${sql.raw(label)}::text as label
      from ${sql.raw(table)} g
      join media m on m.id = g.media_id
      join ${sql.raw(parent)} p on p.id = g.${sql.raw(parentKey)}
      where m.key = ${key}
    `);

    for (const row of rows.rows) {
      found.push({
        table,
        column: "media_id",
        rowId: row.id,
        label: row.label ?? "(untitled)",
      });
    }
  }

  return found;
}
