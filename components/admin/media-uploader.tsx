"use client";

import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { useUploadThing } from "@/lib/uploadthing/client";
import { Button } from "@/components/ui/button";

/**
 * Drag-and-drop upload for the media library.
 *
 * Built on `useUploadThing` rather than UploadThing's own dropzone so it uses
 * the site's buttons, colours and focus rings.
 *
 * Accessibility: the drop zone is a real `<input type="file">` with a `<label>`,
 * so it is reachable by keyboard and announced as a file input. Drag-and-drop is
 * an enhancement layered on top — it is not the only way in, because a drop
 * target is unusable without a pointer. Progress and completion are announced
 * through `aria-live`.
 */
export function MediaUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { startUpload, isUploading } = useUploadThing("contentImage", {
    onClientUploadComplete: (files) => {
      setStatus(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"}.`);
      setError(null);
      // The library is a server component; refresh re-reads it from UploadThing.
      router.refresh();
    },
    onUploadError: (uploadError) => {
      setStatus(null);
      setError(uploadError.message || "The upload failed. Try again.");
    },
  });

  const upload = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setStatus(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`);
      setError(null);
      // No content row in mind — the library is where files are uploaded before
      // anyone knows which award or post they belong to.
      void startUpload(files, {});
    },
    [startUpload],
  );

  return (
    <div>
      <label
        htmlFor="media-upload"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          upload(Array.from(event.dataTransfer.files));
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-accent bg-white"
            : "border-border bg-white/60 hover:border-accent"
        }`}
      >
        <Upload aria-hidden className="size-6 text-accent" />
        <span className="text-sm font-medium text-primary">
          Drop images here, or choose files
        </span>
        <span className="text-xs text-muted-foreground">
          JPEG, PNG or WebP · up to 4 MB each · 10 at a time
        </span>

        <input
          ref={inputRef}
          id="media-upload"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={isUploading}
          onChange={(event) => {
            upload(Array.from(event.target.files ?? []));
            // Let the same file be re-selected after a failed attempt.
            event.target.value = "";
          }}
        />
      </label>

      <div aria-live="polite" className="mt-3 min-h-5 text-sm">
        {isUploading ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {status}
          </span>
        ) : status ? (
          <span className="text-muted-foreground">{status}</span>
        ) : null}
        {error ? (
          <span role="alert" className="text-destructive">
            {error}
          </span>
        ) : null}
      </div>

      {/* A visible, focusable alternative for anyone who cannot use the label
          as a drop target — and the obvious control on a touch screen. */}
      <Button
        type="button"
        variant="outline"
        className="mt-2"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        Choose files
      </Button>
    </div>
  );
}
