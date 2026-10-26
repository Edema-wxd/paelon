import { UTApi } from "uploadthing/server";

import { serverEnv } from "@/lib/env";

/**
 * Server-side UploadThing operations for the admin media library.
 *
 * Separate from `core.ts`, which defines the upload *route*. This module is the
 * management side: deleting from the bucket. Listing moved to the `media`
 * table on 2026-10-26 — the row carries alt text, dimensions and an id content
 * can reference, none of which a bucket listing knows.
 *
 * None of these functions check permissions. Callers must go through
 * `lib/uploadthing/actions.ts`, which does.
 */

let api: UTApi | undefined;

/** Lazily constructed so importing this module never forces env parsing. */
function utapi(): UTApi {
  if (!api) {
    api = new UTApi({ token: serverEnv().UPLOADTHING_TOKEN });
  }
  return api;
}

/**
 * Permanently delete files from the CDN.
 *
 * Unlike every other delete in the panel this is not a soft delete — UploadThing
 * destroys the object and the URL 404s immediately. Any content row still
 * pointing at it will render a broken image, which is why the action layer
 * refuses to delete a file that is still referenced.
 */
export async function deleteMedia(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const result = await utapi().deleteFiles(keys);
  return result.deletedCount;
}
