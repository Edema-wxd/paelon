"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ForbiddenError } from "@/lib/auth/policy";
import { requireCan } from "@/lib/auth/session";
import { writeAuditEntry } from "@/lib/db/queries/users";
import { findMediaReferences } from "@/lib/db/queries/media-references";
import { deleteMedia } from "@/lib/uploadthing/api";

/**
 * Media library mutations.
 *
 * A server action is a public POST endpoint, so each one re-checks permission
 * for itself. The admin layout's session check does not run for these, and the
 * fact that the UI only renders a delete button for some roles is a courtesy,
 * not a control.
 */

export interface MediaActionState {
  error?: string;
  /** Set on success so the client can announce it through `aria-live`. */
  message?: string;
  /** Populated when a delete was refused because the file is still in use. */
  references?: { label: string; table: string }[];
}

/** Keys are UUID-prefixed filenames. Bounded so a crafted form cannot ask for 10,000 deletes. */
const deleteSchema = z.object({
  keys: z.array(z.string().min(1).max(512)).min(1).max(50),
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
 */
export async function deleteMediaAction(
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  let user;
  try {
    user = await requireCan("delete", "media");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "You do not have permission to delete media." };
    }
    throw error;
  }

  const parsed = deleteSchema.safeParse({ keys: formData.getAll("key") });
  if (!parsed.success) {
    return { error: "Select between 1 and 50 files to delete." };
  }

  const { keys } = parsed.data;

  // Check every key before deleting any of them — a partial delete that stops
  // halfway leaves the library in a state nobody asked for.
  const blocked: { label: string; table: string }[] = [];
  for (const key of keys) {
    for (const reference of await findMediaReferences(key)) {
      blocked.push({ label: reference.label, table: reference.table });
    }
  }

  if (blocked.length > 0) {
    return {
      error:
        "Some of those files are still used on the site. Remove them from the content below first.",
      references: blocked,
    };
  }

  const deleted = await deleteMedia(keys);

  await writeAuditEntry({
    userId: user.id,
    action: "media.deleted",
    entityType: "media",
    metadata: { keys, count: deleted },
  });

  revalidatePath("/admin/media");

  return {
    message: `Deleted ${deleted} file${deleted === 1 ? "" : "s"}.`,
  };
}
