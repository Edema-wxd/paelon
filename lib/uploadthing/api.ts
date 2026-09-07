import { UTApi } from "uploadthing/server";

import { serverEnv } from "@/lib/env";

/**
 * Server-side UploadThing operations for the admin media library.
 *
 * Separate from `core.ts`, which defines the upload *route*. This module is the
 * management side: listing what is in the bucket and deleting from it. Nothing
 * here is cached — a media library that shows a file someone deleted an hour
 * ago is worse than a slow one.
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

export interface MediaFile {
  key: string;
  id: string;
  name: string;
  size: number;
  uploadedAt: number;
  status: "Deletion Pending" | "Failed" | "Uploaded" | "Uploading";
  /** Public CDN URL. Files are uploaded `public-read` (see core.ts). */
  url: string;
}

/**
 * The app id, decoded from `UPLOADTHING_TOKEN`.
 *
 * v7 serves public files from `https://<appId>.ufs.sh/f/<key>`, and `listFiles`
 * returns keys rather than URLs — so the host has to be reconstructed. The token
 * is base64-encoded JSON carrying `apiKey`, `appId` and `regions`; only `appId`
 * is read here and it is never logged or sent to the client.
 */
function appId(): string {
  const token = serverEnv().UPLOADTHING_TOKEN;
  if (!token) throw new Error("UPLOADTHING_TOKEN is not set.");

  try {
    const decoded = JSON.parse(
      Buffer.from(token, "base64").toString("utf8"),
    ) as { appId?: unknown };

    if (typeof decoded.appId !== "string" || decoded.appId.length === 0) {
      throw new Error("no appId");
    }
    return decoded.appId;
  } catch {
    // Deliberately says nothing about the token's contents.
    throw new Error("UPLOADTHING_TOKEN is malformed.");
  }
}

/** Public URL for a file key. */
export function mediaUrl(key: string): string {
  return `https://${appId()}.ufs.sh/f/${key}`;
}

/**
 * One page of the media library, newest first.
 *
 * `hasMore` drives the pager rather than a total count, because the API does not
 * return one and guessing a page count from a partial page is how a library
 * quietly hides its last file.
 */
export async function listMedia(
  opts: { limit?: number; offset?: number } = {},
): Promise<{ files: MediaFile[]; hasMore: boolean }> {
  const { limit = 60, offset = 0 } = opts;
  const result = await utapi().listFiles({ limit, offset });

  const files = result.files
    .map((file) => ({
      key: file.key,
      id: file.id,
      name: file.name,
      size: file.size,
      uploadedAt: file.uploadedAt,
      status: file.status,
      url: mediaUrl(file.key),
    }))
    .sort((a, b) => b.uploadedAt - a.uploadedAt);

  return { files, hasMore: result.hasMore };
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
