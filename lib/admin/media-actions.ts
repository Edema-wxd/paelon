"use server";

import { z } from "zod";

import type { PickableMedia } from "@/components/admin/markdown-media-picker";
import { can } from "@/lib/auth/policy";
import { getAdminUser } from "@/lib/auth/session";
import { MEDIA_PAGE_SIZE, searchMediaRows } from "@/lib/db/queries/media";

/**
 * Library search for the image picker (decision G1; the 60-row cap it replaced
 * is described on `searchMediaRows`).
 *
 * ## Why this is not `adminAction`
 *
 * `adminAction` is the wrapper for writes: it parses, writes an audit row and
 * revalidates a cache tag. This is a read. Auditing every keystroke of a search
 * would bury the entries that matter — the audit log answers "who changed
 * what", and nobody changed anything here — and there is nothing to
 * revalidate. So the session and permission checks are done directly, in the
 * same order and failing the same way.
 *
 * Fails closed: `getAdminUser` returns null for a missing, expired or revoked
 * session, and `can` denies anything it does not recognise. The gate is `read`
 * on `media`, which is the same permission the library screen requires — a
 * contributor may browse the library, which is what makes an image reusable
 * rather than re-uploaded.
 *
 * The refusal says nothing about why. An action that distinguished "not signed
 * in" from "not allowed" would tell an unauthenticated caller which accounts
 * exist, and `lib/auth/policy.ts` is explicit that an authorisation error must
 * not teach the caller what role would have worked.
 */

const searchInput = z.object({
  /** Matched against alt text and filename. Empty means "the whole library". */
  query: z.string().trim().max(120).optional(),
  /** Rows already shown. Bounded so a hand-made call cannot ask for a deep scan. */
  offset: z.number().int().min(0).max(5000).optional(),
});

export type MediaSearchResult =
  | { ok: true; rows: PickableMedia[]; hasMore: boolean }
  | { ok: false };

/** One page of the media library, or `{ ok: false }` if the caller may not read it. */
export async function searchMediaAction(
  input: z.input<typeof searchInput>,
): Promise<MediaSearchResult> {
  const parsed = searchInput.safeParse(input);
  if (!parsed.success) return { ok: false };

  const user = await getAdminUser();
  if (!user || !can(user.role, "read", "media")) return { ok: false };

  const { rows, hasMore } = await searchMediaRows({
    ...(parsed.data.query === undefined ? {} : { query: parsed.data.query }),
    ...(parsed.data.offset === undefined ? {} : { offset: parsed.data.offset }),
    limit: MEDIA_PAGE_SIZE,
  });

  return {
    ok: true,
    hasMore,
    // Only the fields the picker renders. The row also carries `uploadedBy`
    // and the soft-delete timestamp, which are nobody's business in a modal.
    rows: rows.map((row) => ({
      id: row.id,
      url: row.url,
      alt: row.alt,
      filename: row.filename,
      width: row.width,
      height: row.height,
    })),
  };
}
