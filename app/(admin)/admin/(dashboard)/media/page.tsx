import type { Metadata } from "next";

import { MediaGrid } from "@/components/admin/media-grid";
import { MediaUploader } from "@/components/admin/media-uploader";
import { NotPermitted } from "@/components/admin/not-permitted";
import { can } from "@/lib/auth/policy";
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

export default async function AdminMediaPage() {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "media")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const { files, hasMore } = await listMedia({ limit: 60 });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-primary">Media</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Editorial images — blog heroes, headshots, branch galleries. Paste a
        file&rsquo;s URL into the matching field in content. Deleting is
        permanent and is refused while a file is still in use.
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
          <MediaGrid files={files} canDelete={can(user.role, "delete", "media")} />
        </div>
        {hasMore ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Showing the 60 most recent files. Older files are not listed yet.
          </p>
        ) : null}
      </section>
    </div>
  );
}
