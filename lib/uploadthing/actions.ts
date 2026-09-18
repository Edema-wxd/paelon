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
import { findMediaReferences } from "@/lib/db/queries/media-references";
import { deleteMedia } from "@/lib/uploadthing/api";
import {
  MEDIA_DELETE_COUNT_MESSAGE,
  MEDIA_DELETE_MAX,
} from "@/lib/uploadthing/limits";

/**
 * Media library mutations, built on `adminAction` (lib/admin/action.ts), which
 * does the session, `can(..., "media")`, parsing, audit row and revalidation.
 */

export interface MediaReferenceSummary {
  label: string;
  table: string;
}

type MediaData = { message: string };
type MediaDetails = { references: MediaReferenceSummary[] };

export type MediaResult = ActionResult<MediaData, MediaDetails>;
export type MediaState = ActionState<MediaData, MediaDetails>;

/** Keys are UUID-prefixed filenames. */
const deleteSchema = z.object({
  keys: z
    .array(z.string().min(1).max(512))
    .min(1, MEDIA_DELETE_COUNT_MESSAGE)
    .max(MEDIA_DELETE_MAX, MEDIA_DELETE_COUNT_MESSAGE),
});

/**
 * Permanently delete files from UploadThing.
 *
 * Refuses any key still referenced by a content row. This is not a soft delete
 * and there is no undo — the CDN destroys the object — so the check runs before
 * the call rather than reporting damage after it.
 *
 * Deleting media is *not* a sensitive-resource delete: the file is replaceable,
 * unlike a patient record. `media` is therefore open to editors and media
 * personnel, and the reference check is what keeps that safe.
 *
 * Contributors may delete only files they uploaded (policy B3). There is no
 * `media` table yet, so no file has a recorded owner: with no `row` loader,
 * `adminAction` judges the delete against an unowned row and refuses every
 * contributor before parsing, while admins and editors pass. When the table
 * lands (spec §8 Content editing), add a `row` loader that reads `uploaded_by`.
 */
export const deleteMediaAction = adminAction(
  {
    resource: "media",
    action: "delete",
    schema: deleteSchema,
    event: "media.deleted",
    path: "/admin/media",
    input: (formData) => ({ keys: formData.getAll("key") }),
  },
  async ({
    keys,
  }): Promise<HandlerSuccess<MediaData> | ActionFailure<MediaDetails>> => {
    // Check every key before deleting any of them — a partial delete that stops
    // halfway leaves the library in a state nobody asked for.
    const references: MediaReferenceSummary[] = [];
    for (const key of keys) {
      for (const reference of await findMediaReferences(key)) {
        references.push({ label: reference.label, table: reference.table });
      }
    }

    if (references.length > 0) {
      return fail(
        "Some of those files are still used on the site. Remove them from the content below first.",
        { details: { references } },
      );
    }

    const deleted = await deleteMedia(keys);

    return done(
      { message: `Deleted ${deleted} file${deleted === 1 ? "" : "s"}.` },
      { metadata: { keys, count: deleted } },
    );
  },
);
