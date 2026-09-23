"use client";

import { Loader2, Upload, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUploadThing } from "@/lib/uploadthing/client";

/** The field's value. `url` is display-only — it is not submitted. */
export interface ImageFieldValue {
  mediaId: string | null;
  url: string | null;
  alt: string;
  decorative: boolean;
}

/**
 * An image plus its alt text, as one control (spec §8: image uploads via
 * UploadThing, alt text on the media row).
 *
 * ## Why alt text is part of the same field
 *
 * Because a shipped image without alt text is a blocking accessibility
 * failure, not a nit (CLAUDE.md). A separate optional "alt text" box further
 * down the form is a box people skip. Here, choosing a file reveals a required
 * alt input directly beneath the thumbnail, and the only way past it is to say
 * the image is decorative on purpose. The server enforces the same rule —
 * `imageAltRule` in `lib/admin/resources/fields.ts` — because this component
 * is a convenience, not a guarantee.
 *
 * Alt text is written to the `media` row rather than the content row, so a
 * logo reused on a second award does not need describing twice.
 *
 * Built on `useUploadThing`, not UploadThing's own dropzone, for the reason
 * given in `lib/uploadthing/client.ts`: its components ship a second design
 * system for one control.
 */
export function ResourceImageField({
  name,
  altName,
  decorativeName,
  label,
  altLabel,
  hint,
  value,
  onChange,
  contentType,
  slug,
  errors,
  altErrors,
}: {
  name: string;
  altName: string;
  decorativeName: string;
  label: string;
  altLabel: string;
  hint?: string;
  /** Controlled, so the form owns validation state for all three parts. */
  value: ImageFieldValue;
  onChange: (next: ImageFieldValue) => void;
  /** Recorded on the upload so an orphaned file can be traced back. */
  contentType: string;
  slug: string;
  errors?: string[];
  altErrors?: string[];
}) {
  const { mediaId, url, alt, decorative } = value;
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { startUpload, isUploading } = useUploadThing("contentImage", {
    onClientUploadComplete: (files) => {
      const uploaded = files[0];
      if (!uploaded) return;
      onChange({
        ...value,
        mediaId: uploaded.serverData.mediaId,
        url: uploaded.serverData.url,
      });
      setUploadError(null);
    },
    onUploadError: (error) => {
      setUploadError(error.message || "The upload failed. Try again.");
    },
  });

  const inputId = `field-${name}`;
  const altId = `field-${altName}`;
  const decorativeId = `field-${decorativeName}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = errors?.length ? `${inputId}-error` : undefined;
  const altErrorId = altErrors?.length ? `${altId}-error` : undefined;

  return (
    <fieldset className="rounded-xl border border-border bg-white p-4">
      <legend className="px-1 text-sm font-medium text-primary">{label}</legend>

      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {/* The value the form actually submits. Set by the upload, cleared by
          "Remove" — never typed, so it is hidden rather than readonly. */}
      <input type="hidden" name={name} value={mediaId ?? ""} />

      {url ? (
        <div className="mt-3 flex items-start gap-4">
          <Image
            src={url}
            // Empty on purpose: the alt text being edited below is the image's
            // description for the live site. Repeating it here would have a
            // screen reader announce the same words twice in one control.
            alt=""
            width={96}
            height={96}
            className="size-24 rounded-md border border-border object-contain"
            unoptimized
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({ mediaId: null, url: null, alt: "", decorative: false })
            }
          >
            <X aria-hidden className="size-4" />
            Remove image
          </Button>
        </div>
      ) : null}

      <div className="mt-3">
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-primary hover:border-accent"
        >
          {isUploading ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <Upload aria-hidden className="size-4" />
          )}
          {url ? "Replace image" : "Choose an image"}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={isUploading}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setUploadError(null);
            void startUpload([file], { contentType, slug });
          }}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          JPEG, PNG or WebP · up to 4 MB
        </p>
      </div>

      <div aria-live="polite" className="mt-2 min-h-5 text-sm empty:hidden">
        {isUploading ? (
          <span className="text-muted-foreground">Uploading…</span>
        ) : null}
        {uploadError ? (
          <span role="alert" className="text-destructive">
            {uploadError}
          </span>
        ) : null}
        {errors?.length ? (
          <span id={errorId} role="alert" className="text-destructive">
            {errors[0]}
          </span>
        ) : null}
      </div>

      {/* Only once there is an image: alt text for nothing is a question with
          no answer, and a required field that cannot be satisfied. */}
      {mediaId ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <div className="space-y-1">
            <label htmlFor={altId} className="block text-sm font-medium text-foreground">
              {altLabel}
              {decorative ? null : <span className="text-destructive"> *</span>}
            </label>
            <Input
              id={altId}
              name={altName}
              value={alt}
              // `readOnly`, not `disabled`: a disabled input is left out of
              // `FormData`, and the server schema expects the field to be
              // present and empty rather than missing.
              readOnly={decorative}
              maxLength={300}
              required={!decorative}
              aria-invalid={altErrors?.length ? true : undefined}
              aria-describedby={altErrorId}
              onChange={(event) => onChange({ ...value, alt: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              What the image shows, for anyone who cannot see it. Not
              &ldquo;image&rdquo; or &ldquo;logo&rdquo; on its own.
            </p>
            {altErrors?.length ? (
              <p id={altErrorId} role="alert" className="text-sm text-destructive">
                {altErrors[0]}
              </p>
            ) : null}
          </div>

          <div className="flex items-start gap-2">
            <input
              id={decorativeId}
              name={decorativeName}
              type="checkbox"
              value="on"
              checked={decorative}
              className="mt-0.5 size-4 rounded border-input"
              onChange={(event) =>
                onChange({
                  ...value,
                  decorative: event.target.checked,
                  // A decorative image has no description by definition, so the
                  // box is cleared rather than kept and ignored.
                  alt: event.target.checked ? "" : value.alt,
                })
              }
            />
            <label htmlFor={decorativeId} className="text-sm text-foreground">
              Decorative — it carries no information the text does not already
              give
            </label>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
