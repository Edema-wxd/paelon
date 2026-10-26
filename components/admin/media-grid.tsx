"use client";

import { ImageOff, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import type { MediaUsage } from "@/lib/db/queries/media-references";
import {
  deleteMediaAction,
  updateMediaAltAction,
  type MediaState,
} from "@/lib/uploadthing/actions";
import { MEDIA_ALT_MAX } from "@/lib/uploadthing/limits";

/**
 * The media library grid: one card per `media` row.
 *
 * Built on the `media` table, not the bucket listing it used to read, because
 * the row is where everything an editor needs lives — the alt text every page
 * uses, the dimensions, and (through `findMediaUsage`) where the file is used.
 * A bucket listing knows none of that, so the grid showed filenames and a
 * delete checkbox and nothing else.
 *
 * `canEdit` and `canDelete` only decide whether controls render. The actions
 * re-check permission on the server against the row's owner, because a hidden
 * button is not a permission check.
 */

export interface MediaCardData {
  id: string;
  url: string;
  filename: string | null;
  /** Null: not written yet. "": deliberately decorative. */
  alt: string | null;
  width: number | null;
  height: number | null;
  usage: MediaUsage[];
  canEdit: boolean;
  canDelete: boolean;
}

export function MediaGrid({ items }: { items: MediaCardData[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.id} className="flex">
          <MediaCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function SubmitButton({
  children,
  pendingLabel,
  variant = "default",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "default" | "destructive";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

function MediaCard({ item }: { item: MediaCardData }) {
  const baseId = useId();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [decorative, setDecorative] = useState(item.alt === "");
  const altRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  // Focus follows the disclosure: into the field on open, back to the button
  // that opened it on close, so a keyboard user is never dropped on <body>.
  const opened = useRef(false);
  useEffect(() => {
    if (editing) {
      opened.current = true;
      altRef.current?.focus();
    } else if (opened.current) {
      editRef.current?.focus();
    }
  }, [editing]);

  const [altState, altAction] = useActionState<MediaState, FormData>(
    async (prev, formData) => {
      const result = await updateMediaAltAction(prev, formData);
      if (result.ok) setEditing(false);
      return result;
    },
    null,
  );
  const [deleteState, deleteAction] = useActionState<MediaState, FormData>(
    async (prev, formData) => {
      const result = await deleteMediaAction(prev, formData);
      if (!result.ok) setConfirming(false);
      return result;
    },
    null,
  );

  const name = item.filename ?? "Untitled file";
  const live = item.usage.filter((use) => !use.deleted);
  const inUse = item.usage.length > 0;
  const altError = altState && !altState.ok ? (altState.fields.alt?.[0] ?? altState.error) : null;
  const altId = `${baseId}-alt`;
  const altErrorId = `${baseId}-alt-error`;

  return (
    <article
      aria-labelledby={`${baseId}-name`}
      className="flex w-full flex-col overflow-hidden rounded-xl border border-border bg-white"
    >
      {/* Contained, not cropped: most of this library is logos, and a square
          crop cut "Allianz" down to "anz". alt="" because the filename is the
          card's heading right below it (decision D3). */}
      <div className="relative flex aspect-4/3 items-center justify-center overflow-hidden border-b border-border bg-white">
        {item.width && item.height ? (
          <Image
            src={item.url}
            alt=""
            width={item.width}
            height={item.height}
            sizes="(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 90vw"
            className="absolute inset-0 size-full object-contain p-6"
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <ImageOff aria-hidden className="size-5" />
            No dimensions recorded
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="min-w-0">
          <h3 id={`${baseId}-name`} className="truncate text-sm font-medium text-primary" title={name}>
            {name}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.width && item.height ? `${item.width} × ${item.height} px` : "Size unknown"}
          </p>
        </div>

        <div>
          <h4 id={`${baseId}-alt-heading`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Alt text
          </h4>

          {editing ? (
            <form action={altAction} className="mt-2 space-y-2">
              <input type="hidden" name="id" value={item.id} />
              <label htmlFor={altId} className="sr-only">
                Alt text for {name}
              </label>
              <textarea
                ref={altRef}
                id={altId}
                name="alt"
                rows={3}
                maxLength={MEDIA_ALT_MAX}
                defaultValue={item.alt ?? ""}
                disabled={decorative}
                aria-invalid={altError ? true : undefined}
                aria-describedby={altError ? altErrorId : undefined}
                className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-primary outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:bg-secondary disabled:text-muted-foreground"
              />
              <label className="flex items-center gap-2 text-xs text-primary">
                <input
                  type="checkbox"
                  name="decorative"
                  checked={decorative}
                  onChange={(event) => setDecorative(event.target.checked)}
                  className="size-4 rounded border-input accent-brand-maroon"
                />
                Decorative — carries no information
              </label>
              {altError ? (
                <p id={altErrorId} role="alert" className="text-xs text-destructive">
                  {altError}
                </p>
              ) : null}
              <div className="flex gap-2">
                <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              {item.alt ? (
                <p className="mt-1 text-sm wrap-break-word text-primary">{item.alt}</p>
              ) : item.alt === "" ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Decorative — screen readers skip it.
                </p>
              ) : (
                <p className="mt-1 text-sm text-amber-800">
                  Not written yet. Describe it before it goes on a page.
                </p>
              )}
              {altState?.ok ? (
                <p role="status" className="mt-1 text-xs text-emerald-700">
                  {altState.data.message}
                </p>
              ) : null}
              {item.canEdit ? (
                <button
                  ref={editRef}
                  type="button"
                  onClick={() => {
                    setDecorative(item.alt === "");
                    setEditing(true);
                  }}
                  className="mt-1 rounded-sm text-xs font-medium text-accent underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Edit alt text<span className="sr-only"> for {name}</span>
                </button>
              ) : null}
            </>
          )}
          {item.usage.length > 1 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Changes it everywhere this file is used.
            </p>
          ) : null}
        </div>

        <div>
          <h4 id={`${baseId}-used-heading`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Used in
          </h4>
          {inUse ? (
            <ul className="mt-1 space-y-1">
              {item.usage.map((use) => (
                <li key={`${use.kind}-${use.href}`} className="text-sm">
                  <span className="text-muted-foreground">{use.kind}: </span>
                  <Link
                    href={use.href}
                    className="text-primary underline underline-offset-4 hover:no-underline"
                  >
                    {use.label}
                  </Link>
                  {use.deleted ? <span className="text-xs text-muted-foreground"> (deleted)</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Not used anywhere yet.</p>
          )}
          {inUse && live.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Only deleted content uses it, but that content can be restored, so the file stays.
            </p>
          ) : null}
        </div>

        {item.canDelete ? (
          <div className="mt-auto border-t border-border pt-3">
            {deleteState && !deleteState.ok ? (
              <div role="alert" className="mb-2 text-xs text-destructive">
                <p>{deleteState.error}</p>
              </div>
            ) : null}

            {inUse ? (
              <p className="text-xs text-muted-foreground">
                Can’t be deleted while it is used. Remove it from the content above first.
              </p>
            ) : confirming ? (
              <form action={deleteAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={item.id} />
                <p className="w-full text-xs text-primary">
                  Delete {name} permanently? The file is destroyed and cannot be restored.
                </p>
                <SubmitButton variant="destructive" pendingLabel="Deleting…">
                  Delete file
                </SubmitButton>
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </form>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
                <Trash2 aria-hidden />
                Delete<span className="sr-only"> {name}</span>
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
