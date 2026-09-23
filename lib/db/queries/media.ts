import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
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
 */
export async function recordUpload(input: {
  key: string;
  url: string;
  filename: string | null;
  uploadedBy: string | null;
}): Promise<Media> {
  const rows = await db()
    .insert(media)
    .values({
      key: input.key,
      url: input.url,
      alt: "",
      filename: input.filename,
      uploadedBy: input.uploadedBy,
    })
    .onConflictDoUpdate({
      target: media.key,
      set: { url: input.url, deletedAt: null },
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
