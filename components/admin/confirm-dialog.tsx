"use client";

import { useId, useRef } from "react";

import { Button } from "@/components/ui/button";

/**
 * A confirmation step in front of a destructive submit button.
 *
 * Built on the native `<dialog>` element rather than a dialog library. Calling
 * `showModal()` gives focus trapping, `Escape` to dismiss, the inert backdrop
 * and `aria-modal` semantics from the platform — all of which CLAUDE.md's
 * accessibility floor requires and none of which cost a dependency or a byte of
 * the spec §13 JS budget. shadcn's dialog would pull in Radix for this.
 *
 * The dialog stays inside the surrounding `<form>` in the DOM even while the
 * browser paints it in the top layer, so the confirm button is still a submit
 * button for that form and carries its own `name`/`value` — the parent reads
 * the intent exactly as it would from an ordinary toolbar button.
 *
 * Focus opens on *cancel*, not confirm. A keyboard user who hits the dialog
 * mid-flow and presses Enter out of habit should keep their bookings.
 *
 * Without JavaScript the trigger does nothing, which is correct here: the
 * selection it acts on is itself client state, so there is no unconfirmed path
 * to the action for it to leave open.
 */
export function ConfirmDialog({
  triggerLabel,
  title,
  description,
  confirmLabel,
  cancelLabel = "Go back",
  name,
  value,
  disabled = false,
}: {
  triggerLabel: string;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Submitted with the enclosing form, so the parent can dispatch on intent. */
  name: string;
  value: string;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => dialog.current?.showModal()}
      >
        {triggerLabel}
      </Button>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-w-md rounded-xl border border-border bg-white p-6 text-left shadow-lg backdrop:bg-primary/40 open:m-auto"
      >
        <h2 id={titleId} className="text-lg font-medium text-primary">
          {title}
        </h2>
        <div id={descriptionId} className="mt-2 text-sm text-muted-foreground">
          {description}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            autoFocus
            onClick={() => dialog.current?.close()}
          >
            {cancelLabel}
          </Button>
          {/* Submits the enclosing form. `close()` runs first so the dialog is
              gone by the time the action's result renders behind it. */}
          <Button
            type="submit"
            name={name}
            value={value}
            variant="destructive"
            size="sm"
            onClick={() => dialog.current?.close()}
          >
            {confirmLabel}
          </Button>
        </div>
      </dialog>
    </>
  );
}
