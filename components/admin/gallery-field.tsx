"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useState } from "react";

import {
  MarkdownMediaPicker,
  type PickableMedia,
} from "@/components/admin/markdown-media-picker";

/**
 * An ordered set of images from the media library (field type `gallery`).
 *
 * ## One upload, many galleries
 *
 * This holds references, not copies. The same `media` row can sit in a branch
 * gallery, a service gallery and a blog post's hero at once, and its alt text
 * is written once on the asset. Adding a picture here never uploads anything.
 *
 * ## Why buttons and not drag-and-drop
 *
 * Reordering is "move up" / "move down" on each row. A drag handle needs either
 * a dependency or a hand-rolled pointer implementation, and either way it is
 * unusable by keyboard unless a parallel control exists anyway — so the
 * parallel control is the only control. It is also the one that works on a
 * phone without fighting the page scroll.
 *
 * Each move announces itself through `aria-live`, because the thing that
 * changed is the order of a list the user is not looking at character by
 * character. Focus stays on the button, which has moved with its row, so a
 * keyboard user can press it again to keep going.
 *
 * ## How it submits
 *
 * One hidden input per image, all under the field's name, in the arranged
 * order. `resourceInput` reads them with `getAll`, which preserves document
 * order, and `syncRelationIn` writes the index into the join row's `order`.
 * An empty gallery submits nothing, which the schema reads as an empty list.
 */
export function GalleryField({
  name,
  label,
  value,
  onChange,
  max = 24,
  describedBy,
}: {
  name: string;
  /** Used in the picker's heading, so it says which gallery is being filled. */
  label: string;
  /** The chosen assets, in order. The form owns this. */
  value: readonly PickableMedia[];
  onChange: (next: readonly PickableMedia[]) => void;
  max?: number;
  describedBy?: string;
}) {
  const [announcement, setAnnouncement] = useState("");

  function describe(asset: PickableMedia): string {
    return asset.alt.trim() || asset.filename || "Untitled image";
  }

  function add(asset: PickableMedia) {
    if (value.some((entry) => entry.id === asset.id)) return;
    if (value.length >= max) {
      setAnnouncement(`A gallery holds at most ${max} images.`);
      return;
    }

    onChange([...value, asset]);
    setAnnouncement(`${describe(asset)} added at position ${value.length + 1}.`);
  }

  function remove(id: string) {
    const asset = value.find((entry) => entry.id === id);
    onChange(value.filter((entry) => entry.id !== id));
    if (asset) setAnnouncement(`${describe(asset)} removed.`);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= value.length) return;

    const next = [...value];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);

    onChange(next);
    setAnnouncement(`${describe(moved)} moved to position ${to + 1} of ${next.length}.`);
  }

  return (
    <div>
      {value.map((asset) => (
        <input key={asset.id} type="hidden" name={name} value={asset.id} />
      ))}

      {value.length > 0 ? (
        <ol className="space-y-2" aria-describedby={describedBy}>
          {value.map((asset, index) => (
            <li
              key={asset.id}
              className="flex items-center gap-3 rounded-lg border border-border p-2"
            >
              <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">
                {index + 1}
              </span>

              {/* A library thumbnail in an admin form, not content: a plain
                  `img` rather than routing a 48px box through the optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset.url}
                alt=""
                aria-hidden
                width={48}
                height={48}
                className="size-12 shrink-0 rounded object-cover"
              />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-primary">
                  {describe(asset)}
                </span>
                {asset.alt.trim().length === 0 ? (
                  <span className="block text-xs text-destructive">
                    No alt text — add it under Media.
                  </span>
                ) : null}
              </span>

              <span className="flex shrink-0 items-center gap-1">
                <IconButton
                  label={`Move ${describe(asset)} up`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp aria-hidden className="size-4" />
                </IconButton>
                <IconButton
                  label={`Move ${describe(asset)} down`}
                  disabled={index === value.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown aria-hidden className="size-4" />
                </IconButton>
                <IconButton
                  label={`Remove ${describe(asset)} from this gallery`}
                  onClick={() => remove(asset.id)}
                >
                  <X aria-hidden className="size-4" />
                </IconButton>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No images yet.</p>
      )}

      <div className="mt-3 flex items-center gap-3">
        {value.length < max ? (
          <MarkdownMediaPicker
            onPick={add}
            label="Add image"
            title={`Add an image to ${label.toLowerCase()}`}
            description="One upload can appear in any number of galleries and posts. Alt text comes from the media library, so it is written once per image."
            chosen={value.map((asset) => asset.id)}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            This gallery is full ({max} images).
          </p>
        )}
      </div>

      {/* Order changes with no visible focus change, so it is announced. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // The icon is `aria-hidden`, so the accessible name is this label alone.
      aria-label={label}
      className="rounded-md border border-border p-1.5 text-primary hover:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
