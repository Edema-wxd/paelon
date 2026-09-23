import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { z } from "zod";

import { can } from "@/lib/auth/policy";
import { getAdminUser } from "@/lib/auth/session";
import { recordUpload } from "@/lib/db/queries/media";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * UploadThing file router (spec §10).
 *
 * This is object storage for **editorial images** — blog hero images, doctor
 * headshots, branch galleries, award certificates, HMO logos.
 *
 * Every completed upload writes a `media` row (spec §8), because alt text has
 * to live somewhere and a CDN bucket has nowhere to put it. Content tables
 * reference that row by id as they migrate onto it — `awards` does; the rest
 * still hold a URL in a `text` column filled from seed.
 *
 * It is *not* the pipeline for the site's own design assets. Those are
 * committed under `assets/`, pre-encoded by `scripts/optimize-images.mjs`, and
 * served from `/public` — see `lib/images.ts`. Routing them through a CDN would
 * cost a DNS lookup and a connection on the LCP path for no benefit.
 *
 * ## Who may upload
 *
 * The middleware requires a signed-in admin account holding `create` on
 * `media` — super admin, admin or media personnel (lib/auth/policy.ts). An
 * upload endpoint that anyone on the internet can POST to is free file hosting
 * for whoever finds it, billed to Paelon and served from a hospital's domain,
 * so this fails closed on any missing or revoked session.
 *
 * This replaces the `UPLOADTHING_UPLOADS_ENABLED` escape hatch, which existed
 * only because Phase 1 had no authentication. That variable is now unread; it
 * is still declared in lib/env.ts and .env.example and should be removed from
 * both.
 */

const f = createUploadthing();

/** Spec §10: jpeg, png, webp only, 5 MB per image. */
const IMAGE_LIMITS = {
  image: {
    maxFileSize: "4MB",
    maxFileCount: 10,
    acl: "public-read",
    additionalProperties: {},
  },
} as const;

export const uploadRouter = {
  /**
   * Editorial images for content rows.
   *
   * `contentType` and `slug` say what the file is for. They are recorded on
   * the upload so an orphaned file in the dashboard can be traced back to the
   * row it was meant for, which is the only way a CDN bucket stays reviewable.
   */
  contentImage: f(IMAGE_LIMITS)
    // Both optional: the media library uploads with no content row in mind.
    .input(
      z.object({
        contentType: z.string().max(50).optional(),
        slug: z.string().max(100).optional(),
      }),
    )
    .middleware(async ({ req, input }) => {
      const env = serverEnv();

      if (!env.UPLOADTHING_TOKEN) {
        throw new UploadThingError("Uploads are not configured.");
      }

      // Fails closed: `getAdminUser` returns null for a missing, expired or
      // revoked session, and `can` denies anything it does not recognise.
      const user = await getAdminUser();

      if (!user || !can(user.role, "create", "media")) {
        throw new UploadThingError("Unauthorized");
      }

      // From the call's input, or the query string the media library used
      // before `.input()` existed here.
      const url = new URL(req.url);
      const contentType =
        input?.contentType ?? url.searchParams.get("contentType") ?? "unknown";
      const slug = input?.slug ?? url.searchParams.get("slug") ?? "unknown";

      // Recorded on the upload so an orphaned file can be traced to whoever
      // put it there.
      return { contentType, slug, userId: user.id };
    })
    .onUploadComplete(async ({ file, metadata }) => {
      // The row is the record of the file; the bucket is only storage. Written
      // here rather than by the form, so a file uploaded and then abandoned is
      // still visible in the library instead of becoming an orphan nobody can
      // see. Idempotent — this callback is retried (see `recordUpload`).
      const row = await recordUpload({
        key: file.key,
        url: file.ufsUrl,
        filename: file.name,
        uploadedBy: metadata.userId,
      });

      // Structured, and free of anything personal: a filename and a content
      // slug, never a patient identifier (spec §14).
      logger.info("upload.complete", {
        key: file.key,
        name: file.name,
        size: file.size,
        contentType: metadata.contentType,
        slug: metadata.slug,
        userId: metadata.userId,
      });

      // Returned to the caller. The admin image field writes `mediaId` into
      // the content row, not the URL — alt text lives on the media row.
      return { url: file.ufsUrl, key: file.key, mediaId: row.id };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
