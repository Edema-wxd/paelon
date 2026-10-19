"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * One asset an editor can place in a body.
 *
 * A plain serialisable shape, not a `media` row: this is a client component and
 * the editor screen is what reads the library (`listMediaRows`). The id is what
 * ends up in the Markdown; the url and alt are what make the list choosable.
 */
export interface PickableMedia {
  id: string;
  url: string;
  alt: string;
  filename: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Picks an image out of the media library and reports the choice back.
 *
 * ## Why a picker rather than a URL field
 *
 * A body references `media` by id (see `lib/markdown.ts`), so an editor cannot
 * type the reference by hand — nobody knows a uuid. The picker is the only way
 * the syntax is usable, which is why it exists rather than being a convenience.
 *
 * ## Why the native `<dialog>`
 *
 * `showModal()` gives focus trapping, `Escape` to dismiss and an inert
 * backdrop, all of which CLAUDE.md requires of a modal and none of which is
 * worth a dependency. The same choice `components/admin/confirm-dialog.tsx`
 * made, for the same reason.
 *
 * An asset with no recorded dimensions is listed but not choosable: the
 * renderer refuses to build a figure without them (it would mean guessing a
 * ratio against a hard CLS budget), so offering it would place a reference that
 * silently renders as alt text. The row says what to do about it instead.
 */
export function MarkdownMediaPicker({
  media,
  onPick,
}: {
  media: readonly PickableMedia[];
  /** Called with the chosen asset. The caller writes the Markdown. */
  onPick: (asset: PickableMedia) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState("");

  const needle = filter.trim().toLowerCase();
  const shown =
    needle.length === 0
      ? media
      : media.filter(
          (asset) =>
            asset.alt.toLowerCase().includes(needle) ||
            (asset.filename ?? "").toLowerCase().includes(needle),
        );

  function choose(asset: PickableMedia) {
    dialog.current?.close();
    onPick(asset);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-primary hover:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ImagePlus aria-hidden className="size-3.5" />
        Image
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="media-picker-heading"
        className="m-auto max-h-[80vh] w-[min(48rem,92vw)] overflow-y-auto rounded-xl border border-border bg-background p-6 backdrop:bg-black/40"
      >
        <h2 id="media-picker-heading" className="text-lg font-semibold text-primary">
          Insert an image
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Alt text comes from the media library, so it is written once per image
          and stays right everywhere it is used. Upload new images under Media.
        </p>

        {media.length > 0 ? (
          <>
            <label
              htmlFor="media-picker-filter"
              className="mt-4 block text-sm font-medium text-primary"
            >
              Filter by alt text or filename
            </label>
            <input
              id="media-picker-filter"
              type="search"
              value={filter}
              autoComplete="off"
              onChange={(event) => setFilter(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            />

            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {shown.map((asset) => {
                const usable = asset.width !== null && asset.height !== null;
                const described = asset.alt.trim().length > 0;

                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      disabled={!usable}
                      onClick={() => choose(asset)}
                      className="flex w-full items-start gap-3 rounded-lg border border-border p-2 text-start hover:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {/* Deliberately a plain `img`: these are library
                          thumbnails inside an admin modal, not content, and
                          `next/image` would route each one through the
                          optimizer for a 64px box. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.url}
                        alt=""
                        aria-hidden
                        width={64}
                        height={64}
                        className="size-16 shrink-0 rounded object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-primary">
                          {described ? asset.alt : asset.filename || "Untitled"}
                        </span>
                        {!described ? (
                          <span className="mt-0.5 block text-xs text-destructive">
                            No alt text — add it under Media before using this.
                          </span>
                        ) : null}
                        {!usable ? (
                          <span className="mt-0.5 block text-xs text-destructive">
                            No recorded size — re-upload it to use it in a body.
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {shown.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Nothing matched “{filter.trim()}”.
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            The media library is empty. Upload an image under Media first.
          </p>
        )}

        <div className="mt-6 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </Button>
        </div>
      </dialog>
    </>
  );
}
