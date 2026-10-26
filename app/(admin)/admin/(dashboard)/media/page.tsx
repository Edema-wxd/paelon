import type { Metadata } from "next";
import Link from "next/link";

import { MediaGrid, type MediaCardData } from "@/components/admin/media-grid";
import { MediaUploader } from "@/components/admin/media-uploader";
import { NotPermitted } from "@/components/admin/not-permitted";
import { can, canOnRow } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import { searchMediaRows } from "@/lib/db/queries/media";
import { findMediaUsage } from "@/lib/db/queries/media-references";

/**
 * Media library — upload, describe and delete editorial images.
 *
 * Reads the `media` table, not the UploadThing bucket. Every upload writes a
 * row (`lib/uploadthing/core.ts`), and the row carries what the bucket cannot:
 * the alt text every page uses, the dimensions `next/image` needs, and an id
 * that content references — so "where is this used" can be answered and a
 * delete can be refused while the answer is anything.
 *
 * The permission check here is the page's own, not an inherited one, and it
 * renders a refusal rather than throwing — see components/admin/not-permitted.tsx.
 * Per-file controls are decided against each row's uploader, the same rule the
 * actions enforce.
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
  title: "Media library",
  robots: { index: false, follow: false, nocache: true },
};

/** Files per page. Divisible by the grid's two and three columns. */
const PAGE_SIZE = 24;

interface PageProps {
  searchParams: Promise<{ offset?: string; q?: string }>;
}

export default async function AdminMediaPage({ searchParams }: PageProps) {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "media")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 100);

  // Clamped and snapped to a page boundary: an offset typed into the URL should
  // land on a page rather than halfway between two.
  const parsed = Number.parseInt(params.offset ?? "0", 10);
  const offset =
    Number.isFinite(parsed) && parsed > 0
      ? Math.min(Math.floor(parsed / PAGE_SIZE) * PAGE_SIZE, 100_000)
      : 0;

  const { rows, hasMore } = await searchMediaRows({ query, limit: PAGE_SIZE, offset });
  const usage = await findMediaUsage(rows.map((row) => row.id));

  const items: MediaCardData[] = rows.map((row) => ({
    id: row.id,
    url: row.url,
    filename: row.filename,
    alt: row.alt,
    width: row.width,
    height: row.height,
    usage: usage.get(row.id) ?? [],
    canEdit: canOnRow(user, "update", "media", { uploadedBy: row.uploadedBy }),
    canDelete: canOnRow(user, "delete", "media", { uploadedBy: row.uploadedBy }),
  }));

  const hrefFor = (next: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (next > 0) search.set("offset", String(next));
    const qs = search.toString();
    return qs ? `/admin/media?${qs}` : "/admin/media";
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-primary">Media library</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Editorial images: HMO logos, headshots, post and page images. One upload
        serves every page that needs it, so pick it from the image field in
        content rather than uploading a second copy. Alt text edited here
        changes on every page that uses the file. A file can be deleted only
        when nothing uses it, and deleting it is permanent.
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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="library-heading" className="text-lg font-medium text-primary">
            {query ? `Files matching “${query}”` : "Library"}
          </h2>
          <form role="search" action="/admin/media" className="flex items-end gap-2">
            <div>
              <label htmlFor="media-search" className="block text-xs font-medium text-primary">
                Search by filename or alt text
              </label>
              <input
                id="media-search"
                type="search"
                name="q"
                defaultValue={query}
                maxLength={100}
                className="mt-1 h-9 w-64 max-w-full rounded-md border border-input bg-white px-3 text-sm text-primary outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <button
              type="submit"
              className="h-9 rounded-md border border-input bg-white px-3 text-sm font-medium text-primary outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Search
            </button>
          </form>
        </div>

        <div className="mt-4">
          {items.length > 0 ? (
            <MediaGrid items={items} />
          ) : (
            <p className="rounded-xl border border-border bg-white px-6 py-10 text-center text-sm text-muted-foreground">
              {query ? (
                <>
                  No files match “{query}”.{" "}
                  <Link href="/admin/media" className="text-accent underline underline-offset-4">
                    Show all files
                  </Link>
                </>
              ) : offset > 0 ? (
                "No files on this page."
              ) : (
                "No files in the media library yet."
              )}
            </p>
          )}
        </div>

        {/* Prev/next rather than numbered pages: `searchMediaRows` fetches one
            row past the page to know there is more, rather than counting the
            whole table. */}
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
              {items.length > 0
                ? `Files ${offset + 1}–${offset + items.length}`
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
