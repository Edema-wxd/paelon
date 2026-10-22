import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { media, type Media } from "@/lib/db/schema";

/**
 * The `media` table repository (spec §8 Content editing).
 *
 * Never cached. The library is mutable and every read of it is authenticated —
 * `cachedRead` is for public content only (spec §5).
 */

/** One media row by id, or `null` when it does not exist or was deleted. */
export async function getMediaById(id: string): Promise<Media | null> {
  const rows = await db()
    .select()
    .from(media)
    .where(and(eq(media.id, id), isNull(media.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** Several media rows by id, keyed by id. Used to hydrate a list of content rows. */
export async function getMediaByIds(
  ids: readonly string[],
): Promise<Map<string, Media>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return new Map();

  const rows = await db()
    .select()
    .from(media)
    .where(and(inArray(media.id, wanted), isNull(media.deletedAt)));

  return new Map(rows.map((row) => [row.id, row]));
}

/** The library, newest first. */
export async function listMediaRows(limit = 60): Promise<Media[]> {
  return db()
    .select()
    .from(media)
    .where(isNull(media.deletedAt))
    .orderBy(desc(media.createdAt))
    .limit(limit);
}

/** One page of the library. `hasMore` drives the pager; there is no count. */
export interface MediaRowPage {
  rows: Media[];
  hasMore: boolean;
}

/**
 * How many rows one page of the picker holds.
 *
 * Small on purpose: the picker is a modal over a form, and the point of paging
 * is that the *whole* library is reachable, not that a lot of it arrives at
 * once.
 */
export const MEDIA_PAGE_SIZE = 24;

/**
 * Search the library, newest first, one page at a time.
 *
 * ## Why this exists
 *
 * `listMediaRows` returns the 60 newest rows and nothing else. The picker used
 * to filter those 60 in the browser, which meant that once the library passed
 * 60 images an older one could not be found — and the only way to use it again
 * was to upload a second copy. That is the opposite of what a media table is
 * for: one row per asset, referenced by as many content rows as need it.
 *
 * So the filter moved to the database. Every asset is reachable however large
 * the library grows, whether by searching for it or by paging to it.
 *
 * Matching is case-insensitive over alt text and the original filename — the
 * two things an editor might remember about a picture. Not a tsvector: this is
 * a short label on an authenticated screen, and `ilike` over a few thousand
 * rows is both fast enough and exact in a way stemming is not ("ward" should
 * not match "wards" differently depending on the dictionary).
 *
 * One row beyond the page is fetched and dropped, which is how `hasMore` is
 * known without a second `count(*)` over the whole table.
 */
export async function searchMediaRows(
  options: { query?: string; limit?: number; offset?: number } = {},
): Promise<MediaRowPage> {
  const { query = "", limit = MEDIA_PAGE_SIZE, offset = 0 } = options;
  const term = query.trim();

  const filters = [isNull(media.deletedAt)];

  if (term.length > 0) {
    const pattern = `%${term}%`;
    const matches = or(
      ilike(media.alt, pattern),
      ilike(media.filename, pattern),
    );
    // `or()` is only undefined when given no arguments.
    if (matches) filters.push(matches);
  }

  const rows = await db()
    .select()
    .from(media)
    .where(and(...filters))
    // `id` breaks the tie: two files uploaded in the same millisecond would
    // otherwise be ordered arbitrarily, and an unstable sort under LIMIT/OFFSET
    // can show the same row on two pages and skip another entirely.
    .orderBy(desc(media.createdAt), desc(media.id))
    .limit(limit + 1)
    .offset(offset);

  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

/**
 * Media rows for a gallery, in the order the editor arranged them.
 *
 * Ordered by the join row's `order`, not by upload date: a gallery's sequence
 * is a decision somebody made, and `media` has no column that records it.
 *
 * Soft-deleted assets are dropped. The join row survives a media delete being
 * refused, but a row whose asset is gone cannot be rendered or re-picked.
 */
export async function listGalleryMedia(
  joinTable: PgTable,
  ownColumn: PgColumn,
  mediaColumn: PgColumn,
  orderColumn: PgColumn,
  ownId: string,
): Promise<Media[]> {
  return db()
    .select({
      id: media.id,
      key: media.key,
      url: media.url,
      alt: media.alt,
      filename: media.filename,
      width: media.width,
      height: media.height,
      uploadedBy: media.uploadedBy,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
      deletedAt: media.deletedAt,
    })
    .from(joinTable)
    .innerJoin(media, eq(media.id, mediaColumn))
    .where(and(eq(ownColumn, ownId), isNull(media.deletedAt)))
    .orderBy(sql`${orderColumn} asc`, desc(media.createdAt));
}

/**
 * Record an upload, or return the row an earlier upload of the same key made.
 *
 * `onUploadComplete` is at-least-once — UploadThing retries the callback on a
 * non-2xx or a timeout — so this has to be idempotent or a retry becomes a
 * duplicate row pointing at one file. `onConflictDoUpdate` on the key rather
 * than a read-then-write, because two concurrent uploads of the same file
 * would both find nothing and both insert.
 *
 * Alt text is *not* touched on conflict: a retried callback must not blank alt
 * text an editor has since written.
 *
 * Dimensions, by contrast, *are* refreshed on conflict. They are a fact about
 * the file rather than something a person wrote, and a re-upload that replaces
 * the object has to replace them with it — stale dimensions would reserve the
 * wrong box for the new image. Null overwrites null and changes nothing.
 */
export async function recordUpload(input: {
  key: string;
  url: string;
  filename: string | null;
  uploadedBy: string | null;
  /** From the file header; null when it could not be read. */
  width?: number | null;
  height?: number | null;
}): Promise<Media> {
  const rows = await db()
    .insert(media)
    .values({
      key: input.key,
      url: input.url,
      alt: "",
      filename: input.filename,
      uploadedBy: input.uploadedBy,
      width: input.width ?? null,
      height: input.height ?? null,
    })
    .onConflictDoUpdate({
      target: media.key,
      set: {
        url: input.url,
        deletedAt: null,
        width: input.width ?? null,
        height: input.height ?? null,
      },
    })
    .returning();

  // `returning()` on an upsert always yields the row.
  return rows[0] as Media;
}

/**
 * Set a media row's alt text.
 *
 * Returns `null` when the row is gone, which the caller reports as a field
 * error rather than a crash: the editor may have had the form open while
 * someone else deleted the file.
 */
export async function setMediaAlt(
  id: string,
  alt: string,
): Promise<Media | null> {
  const rows = await db()
    .update(media)
    .set({ alt, updatedAt: new Date() })
    .where(and(eq(media.id, id), isNull(media.deletedAt)))
    .returning();
  return rows[0] ?? null;
}
