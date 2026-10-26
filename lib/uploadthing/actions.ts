"use server";

import { z } from "zod";

import {
  adminAction,
  done,
  fail,
  type ActionFailure,
  type ActionResult,
  type ActionState,
  type HandlerSuccess,
} from "@/lib/admin/action";
import { getMediaById, setMediaAlt, softDeleteMedia } from "@/lib/db/queries/media";
import { findMediaReferences, type MediaUsage } from "@/lib/db/queries/media-references";
import { CACHE_TAGS } from "@/lib/db/queries/shared";
import { deleteMedia } from "@/lib/uploadthing/api";
import { MEDIA_ALT_MAX } from "@/lib/uploadthing/limits";

/**
 * Media library mutations, built on `adminAction` (lib/admin/action.ts), which
 * does the session, `canOnRow(..., "media")`, parsing, audit row and
 * revalidation.
 *
 * Both load the media row first, so ownership is judged against
 * `media.uploaded_by`: a contributor may change or delete only what they
 * uploaded (policy B3), while editors and admins may act on any file.
 */

type MediaData = { message: string };
type MediaDetails = { references: MediaUsage[] };

export type MediaResult = ActionResult<MediaData, MediaDetails>;
export type MediaState = ActionState<MediaData, MediaDetails>;

/**
 * Every collection a media row's alt text can appear in. Alt text is read
 * through the content queries' joins, so a change has to reach all of them.
 */
const CONTENT_TAGS = [
  CACHE_TAGS.services,
  CACHE_TAGS.doctors,
  CACHE_TAGS.locations,
  CACHE_TAGS.hmos,
  CACHE_TAGS.testimonials,
  CACHE_TAGS.blogPosts,
  CACHE_TAGS.awards,
  CACHE_TAGS.about,
] as const;

const idSchema = z.object({ id: z.uuid("That file no longer exists.") });

/** The row's owner, for `canOnRow`; null when it is gone or deleted. */
async function mediaOwner(input: { id: string }) {
  const row = await getMediaById(input.id);
  return row ? { uploadedBy: row.uploadedBy } : null;
}

/**
 * Permanently delete one file: from UploadThing, then its `media` row.
 *
 * Refused while anything references it — an image column, a gallery, a body
 * figure or a page block (`findMediaReferences`). This is not a soft delete of
 * the file and there is no undo — the CDN destroys the object — so the check
 * runs before the call rather than reporting damage after it.
 *
 * The row is soft-deleted only once the CDN call returns, so a failed call
 * leaves a live row pointing at a live file rather than a hidden one.
 */
export const deleteMediaAction = adminAction(
  {
    resource: "media",
    action: "delete",
    schema: idSchema,
    event: "media.deleted",
    path: "/admin/media",
    row: mediaOwner,
  },
  async ({ id }): Promise<HandlerSuccess<MediaData> | ActionFailure<MediaDetails>> => {
    const row = await getMediaById(id);
    if (!row) return fail("That file no longer exists.");

    const references = await findMediaReferences(id);
    if (references.length > 0) {
      return fail("This file is still used. Remove it from the content below first.", {
        details: { references },
      });
    }

    await deleteMedia([row.key]);
    await softDeleteMedia(id);

    return done(
      { message: `Deleted ${row.filename ?? "the file"}.` },
      { entityId: id, metadata: { key: row.key } },
    );
  },
);

const altSchema = z
  .object({
    id: z.uuid("That file no longer exists."),
    // Absent when "decorative" is ticked: the form disables the textarea.
    alt: z
      .string()
      .trim()
      .max(MEDIA_ALT_MAX, `Keep alt text to ${MEDIA_ALT_MAX} characters or fewer.`)
      .default(""),
    decorative: z
      .literal("on")
      .optional()
      .transform((value) => value === "on"),
  })
  .check((ctx) => {
    if (ctx.value.alt === "" && !ctx.value.decorative) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value.alt,
        path: ["alt"],
        message: "Describe the image, or tick “decorative” if it carries no information.",
      });
    }
  });

/**
 * Set one file's alt text, for every page that uses it.
 *
 * The same rule as the content forms' image fields: blank is allowed only as
 * a deliberate "decorative", and decorative stores an empty string — the
 * schema's meaning for `media.alt = ''`.
 */
export const updateMediaAltAction = adminAction(
  {
    resource: "media",
    action: "update",
    schema: altSchema,
    event: "media.alt_updated",
    path: "/admin/media",
    tag: CONTENT_TAGS,
    row: mediaOwner,
  },
  async ({ id, alt, decorative }): Promise<HandlerSuccess<MediaData> | ActionFailure<MediaDetails>> => {
    const row = await setMediaAlt(id, decorative ? "" : alt);
    if (!row) return fail("That file no longer exists.");
    return done(
      { message: decorative ? "Marked as decorative." : "Alt text saved." },
      { entityId: id, metadata: { decorative } },
    );
  },
);
