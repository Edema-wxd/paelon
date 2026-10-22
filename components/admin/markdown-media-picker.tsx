"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { searchMediaAction } from "@/lib/admin/media-actions";

/**
 * One asset an editor can place.
 *
 * A plain serialisable shape, not a `media` row: this crosses the server/client
 * boundary, and the row also carries `uploadedBy` and a soft-delete timestamp
 * that have no business in a modal.
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
 * Picks images out of the media library.
 *
 * ## Why a picker rather than a URL field
 *
 * Content references `media` by id (see `lib/markdown.ts` and the image
 * columns), so an editor cannot type the reference by hand — nobody knows a
 * uuid. The picker is the only thing that makes the reference usable, which is
 * why it exists rather than being a convenience.
 *
 * ## Why it queries the server
 *
 * It used to be handed the 60 newest rows and filter them in the browser. Once
 * the library passed 60 images an older one could not be found, and the only
 * way to use it was to upload a second copy — the exact duplication a `media`
 * table exists to prevent. Searching and paging now run in Postgres
 * (`searchMediaRows`), so every asset is reachable however large the library
 * grows, and one upload serves as many content rows as need it.
 *
 * ## Why the native `<dialog>`
 *
 * `showModal()` gives focus trapping, `Escape` to dismiss and an inert
 * backdrop, all of which CLAUDE.md requires of a modal and none of which is
 * worth a dependency. The same choice `components/admin/confirm-dialog.tsx`
 * made, for the same reason.
 *
 * An asset with no recorded dimensions is listed but not choosable: the
 * renderer refuses to build a figure without them, because the alternative is
 * guessing a ratio against a hard CLS budget. The row says what to do instead.
 */
export function MarkdownMediaPicker({
  onPick,
  label = "Image",
  title = "Insert an image",
  description = "Alt text comes from the media library, so it is written once per image and stays right everywhere it is used. Upload new images under Media.",
  /** Ids already chosen, shown as such so the same asset is not added twice. */
  chosen,
}: {
  /** Called with the chosen asset. The caller decides what to do with it. */
  onPick: (asset: PickableMedia) => void;
  label?: string;
  title?: string;
  description?: string;
  chosen?: readonly string[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<PickableMedia[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * The request this component is currently waiting on.
   *
   * Server actions resolve in whatever order they finish, so a slow response to
   * "war" can land after a fast one to "ward" and leave the wrong results on
   * screen. Each request takes a sequence number and a late one is dropped.
   */
  const latest = useRef(0);

  const load = useCallback(
    async (nextQuery: string, offset: number) => {
      const ticket = latest.current + 1;
      latest.current = ticket;

      setLoading(true);
      const result = await searchMediaAction({ query: nextQuery, offset });
      if (latest.current !== ticket) return;

      setLoading(false);

      if (!result.ok) {
        setFailed(true);
        return;
      }

      setFailed(false);
      setHasMore(result.hasMore);
      setRows((current) =>
        offset === 0 ? result.rows : [...current, ...result.rows],
      );
    },
    [],
  );

  // Debounced, so typing a word is one query rather than one per letter. Only
  // while the dialog is open: a closed picker on a form nobody has touched
  // should not be querying anything.
  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => void load(query, 0), 200);
    return () => clearTimeout(timer);
  }, [open, query, load]);

  function choose(asset: PickableMedia) {
    dialog.current?.close();
    onPick(asset);
  }

  const alreadyChosen = new Set(chosen ?? []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-primary hover:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ImagePlus aria-hidden className="size-3.5" />
        {label}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="media-picker-heading"
        onClose={() => setOpen(false)}
        className="m-auto max-h-[80vh] w-[min(48rem,92vw)] overflow-y-auto rounded-xl border border-border bg-background p-6 backdrop:bg-black/40"
      >
        <h2 id="media-picker-heading" className="text-lg font-semibold text-primary">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>

        <label
          htmlFor="media-picker-filter"
          className="mt-4 block text-sm font-medium text-primary"
        >
          Search by alt text or filename
        </label>
        <input
          id="media-picker-filter"
          type="search"
          value={query}
          autoComplete="off"
          maxLength={120}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />

        {/* Announced, because the list below changes without the focus moving. */}
        <p aria-live="polite" className="mt-3 text-xs text-muted-foreground">
          {failed
            ? "The library could not be loaded. Close this and try again."
            : loading
              ? "Searching…"
              : rows.length === 0
                ? query.trim().length > 0
                  ? `Nothing matched “${query.trim()}”.`
                  : "The media library is empty. Upload an image under Media first."
                : `${rows.length} image${rows.length === 1 ? "" : "s"}${hasMore ? ", more available" : ""}`}
        </p>

        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {rows.map((asset) => {
            const usable = asset.width !== null && asset.height !== null;
            const described = asset.alt.trim().length > 0;
            const picked = alreadyChosen.has(asset.id);

            return (
              <li key={asset.id}>
                <button
                  type="button"
                  disabled={!usable || picked}
                  onClick={() => choose(asset)}
                  className="flex w-full items-start gap-3 rounded-lg border border-border p-2 text-start hover:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {/* Deliberately a plain `img`: these are library thumbnails
                      inside an admin modal, not content, and `next/image` would
                      route each one through the optimizer for a 64px box. */}
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
                    {picked ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Already added.
                      </span>
                    ) : null}
                    {!described ? (
                      <span className="mt-0.5 block text-xs text-destructive">
                        No alt text — add it under Media before using this.
                      </span>
                    ) : null}
                    {!usable ? (
                      <span className="mt-0.5 block text-xs text-destructive">
                        No recorded size — re-upload it to use it in content.
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {hasMore ? (
          <div className="mt-4 flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void load(query, rows.length)}
            >
              {loading ? (
                <>
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  Loading
                </>
              ) : (
                "Show more"
              )}
            </Button>
          </div>
        ) : null}

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
