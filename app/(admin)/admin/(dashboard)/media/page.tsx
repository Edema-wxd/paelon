import type { Metadata } from "next";
import Link from "next/link";

import { MediaGrid } from "@/components/admin/media-grid";
import { MediaUploader } from "@/components/admin/media-uploader";
import { NotPermitted } from "@/components/admin/not-permitted";
import { can, canOnRow } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import { listMedia } from "@/lib/uploadthing/api";

/**
 * Media library — upload and delete editorial images.
 *
 * The permission check here is the page's own, not an inherited one, and it
 * renders a refusal rather than throwing — see components/admin/not-permitted.tsx.
 * The role then decides whether the upload and delete controls render at all.
 *
 * Not cached, and `force-dynamic` for the same reason: a media library showing
 * a file someone deleted an hour ago is worse than a slow one.
 *
 * This covers UploadThing only. Design assets under `assets/` are git-tracked
 * and baked into `public/images/` at build time by scripts/optimize-images.mjs,
 * so nothing running on a deployed server can delete them.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Media",
  robots: { index: false, follow: false, nocache: true },
};

/** Files per page. Matches what the grid lays out comfortably. */
const PAGE_SIZE = 60;

interface PageProps {
  searchParams: Promise<{ offset?: string }>;
}

export default async function AdminMediaPage({ searchParams }: PageProps) {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "media")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const { offset: rawOffset } = await searchParams;

  // Clamped and snapped to a page boundary: an offset typed into the URL should
  // land on a page rather than halfway between two.
  const parsed = Number.parseInt(rawOffset ?? "0", 10);
  const offset =
    Number.isFinite(parsed) && parsed > 0
      ? Math.min(Math.floor(parsed / PAGE_SIZE) * PAGE_SIZE, 100_000)
      : 0;

  const { files, hasMore } = await listMedia({ limit: PAGE_SIZE, offset });

  const hrefFor = (next: number) =>
    next <= 0 ? "/admin/media" : `/admin/media?offset=${next}`;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-primary">Media</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Editorial images — blog heroes, headshots, branch galleries. One upload
        serves as many pages as need it: pick it from the image field in
        content rather than uploading a second copy. Alt text set here is what
        every one of those pages uses. Deleting is permanent and is refused
        while a file is still in use.
      </p>

      {can(user.role, "create", "media") ? (
        <section aria-labelledby="upload-heading" className="mt-8">
          <h2 id="upload-heading" className="sr-only">
            Upload files
          </h2>
          <MediaUploader />
        </section>
      ) : null}

      <section aria-labelledby="library-heading" className="mt-10">
        <h2 id="library-heading" className="text-lg font-medium text-primary">
          Library
        </h2>
        <div className="mt-4">
          {/* Same check the action runs: no file has a recorded owner yet, so a
              contributor gets no delete controls rather than ones that always refuse. */}
          <MediaGrid files={files} canDelete={canOnRow(user, "delete", "media", {})} />
        </div>
        {/* Prev/next rather than numbered pages: the bucket API returns no
            total, and `listMedia` is explicit that guessing a page count from a
            partial page is how a library hides its last file. */}
        {offset > 0 || hasMore ? (
          <nav
            aria-label="Media library pagination"
            className="mt-6 flex items-center justify-between gap-4"
          >
            {offset > 0 ? (
              <Link
                href={hrefFor(offset - PAGE_SIZE)}
                className="text-sm text-accent underline underline-offset-4 hover:no-underline"
              >
                Newer files
              </Link>
            ) : (
              <span />
            )}

            <p className="text-sm text-muted-foreground">
              {files.length > 0
                ? `Files ${offset + 1}–${offset + files.length}`
                : "No files on this page"}
            </p>

            {hasMore ? (
              <Link
                href={hrefFor(offset + PAGE_SIZE)}
                className="text-sm text-accent underline underline-offset-4 hover:no-underline"
              >
                Older files
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
