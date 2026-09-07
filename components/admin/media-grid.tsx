"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { deleteMediaAction, type MediaActionState } from "@/lib/uploadthing/actions";
import type { MediaFile } from "@/lib/uploadthing/api";
import { Button } from "@/components/ui/button";

/**
 * The media library grid, with multi-select delete.
 *
 * Delete is permanent — UploadThing destroys the object — so it is behind an
 * explicit selection and a confirmation step, and the server refuses any file
 * still referenced by content. The confirmation is a real disclosure rather than
 * `window.confirm`, which is unstyleable and reads badly to screen readers.
 *
 * `canDelete` only decides whether the controls render. The action re-checks
 * permission on the server, because a hidden button is not a permission check.
 */

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DeleteButton({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="destructive" disabled={pending || count === 0}>
      <Trash2 aria-hidden />
      {pending ? "Deleting…" : `Delete ${count} selected`}
    </Button>
  );
}

export function MediaGrid({
  files,
  canDelete,
}: {
  files: MediaFile[];
  canDelete: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState<MediaActionState, FormData>(
    async (prev, formData) => {
      const result = await deleteMediaAction(prev, formData);
      if (!result.error) {
        setSelected(new Set());
        setConfirming(false);
      }
      return result;
    },
    {},
  );

  if (files.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-white px-6 py-10 text-center text-sm text-muted-foreground">
        No files in the media library yet.
      </p>
    );
  }

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <form action={formAction}>
      <div aria-live="polite" className="mb-4 empty:mb-0">
        {state.message ? (
          <p className="rounded-md border-l-2 border-accent bg-white px-4 py-3 text-sm text-primary">
            {state.message}
          </p>
        ) : null}
        {state.error ? (
          <div
            role="alert"
            className="rounded-md border-l-2 border-destructive bg-white px-4 py-3 text-sm text-destructive"
          >
            <p>{state.error}</p>
            {state.references?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {state.references.map((reference, index) => (
                  <li key={`${reference.table}-${index}`}>
                    {reference.label} <span className="opacity-70">({reference.table})</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {canDelete ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {confirming ? (
            <>
              <p className="text-sm text-primary">
                Permanently delete {selected.size} file
                {selected.size === 1 ? "" : "s"}? This cannot be undone.
              </p>
              <DeleteButton count={selected.size} />
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={selected.size === 0}
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden />
              Delete {selected.size > 0 ? `${selected.size} selected` : "selected"}
            </Button>
          )}
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {files.map((file) => {
          const inputId = `media-${file.key}`;

          return (
            <li
              key={file.key}
              className="overflow-hidden rounded-xl border border-border bg-white"
            >
              {/*
                A plain <img>, not next/image: these are arbitrary user uploads
                behind a CDN the image optimiser has no remote pattern for, and
                the admin panel is not on any performance budget.
                Alt text is the filename — the only description that exists for
                a file nobody has captioned yet.
              */}
              <img
                src={file.url}
                alt={file.name}
                loading="lazy"
                className="aspect-square w-full bg-secondary object-cover"
              />

              <div className="p-3">
                <p className="truncate text-sm font-medium text-primary" title={file.name}>
                  {file.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatSize(file.size)}
                  {file.status !== "Uploaded" ? ` · ${file.status}` : ""}
                </p>

                {canDelete ? (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={inputId}
                      name="key"
                      value={file.key}
                      checked={selected.has(file.key)}
                      onChange={() => toggle(file.key)}
                      className="size-4 rounded border-input accent-[var(--brand-maroon)]"
                    />
                    <label htmlFor={inputId} className="text-xs text-muted-foreground">
                      Select for deletion
                    </label>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </form>
  );
}
