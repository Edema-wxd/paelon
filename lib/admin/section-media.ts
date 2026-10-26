import type { PickableMedia } from "@/components/admin/markdown-media-picker";
import { getMediaByIds } from "@/lib/db/queries/media";
import { collectMediaIds, parseMarkdown } from "@/lib/markdown";
import { sectionMediaIds, type Section } from "@/lib/validation/sections";

/**
 * The media rows a saved layout references, shaped for the layout editor's
 * thumbnails and Markdown previews. One query for every block on the page.
 */
export async function sectionPickableMedia(sections: readonly Section[]): Promise<PickableMedia[]> {
  const ids = sectionMediaIds(sections, (body) => collectMediaIds(parseMarkdown(body)));
  if (ids.length === 0) return [];
  return [...(await getMediaByIds(ids)).values()].map((asset) => ({
    id: asset.id,
    url: asset.url,
    alt: asset.alt,
    filename: asset.filename,
    width: asset.width,
    height: asset.height,
  }));
}
