import { getMediaByIds } from "@/lib/db/queries/media";

/**
 * The images in `ids` whose alt text nobody has written yet (`media.alt` is
 * null, migration 0009), named the way the library labels them.
 *
 * Used where an image is placed by reference rather than through an image
 * field — a figure in a post body, a page block — because those never pass the
 * image field's "describe it or tick decorative" rule. Without this, an
 * undescribed upload reached a live page as `alt=""`, read as decorative by
 * every screen reader: CLAUDE.md baseline item 10 calls that a blocking
 * failure.
 */
export async function undescribedMedia(ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await getMediaByIds(ids);
  return [...rows.values()]
    .filter((row) => row.alt === null)
    .map((row) => row.filename ?? "an untitled image");
}

/** The editor-facing sentence for a refusal over `names`. */
export function undescribedMessage(names: readonly string[]): string {
  const list = names.map((name) => `“${name}”`).join(", ");
  return names.length === 1
    ? `Write alt text for ${list} in the Media library first, or mark it decorative there.`
    : `Write alt text for ${list} in the Media library first, or mark them decorative there.`;
}
