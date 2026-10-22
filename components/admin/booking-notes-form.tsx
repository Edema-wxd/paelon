"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateNotesAction, type BookingState } from "@/lib/admin/bookings-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Internal notes on a booking. Staff-visible, plain text, never shown to the
 * patient and never written to the audit log — the retention job nulls this
 * column along with the rest of the booking's personal data (§14).
 *
 * Saving replaces the whole field, so the textarea is the current value: a
 * notes box that appends would grow without anyone deciding to keep it.
 */

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save notes"}
    </Button>
  );
}

export function BookingNotesForm({
  bookingId,
  notes,
}: {
  bookingId: string;
  notes: string | null;
}) {
  const [state, formAction] = useActionState<BookingState, FormData>(
    async (prev, formData) => updateNotesAction(prev, formData),
    null,
  );

  const error = state && !state.ok ? (state.fields.notes?.[0] ?? state.error) : null;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />

      <div aria-live="polite" className="empty:hidden">
        {state?.ok ? (
          <p className="rounded-md bg-secondary px-3 py-2 text-sm text-primary">
            {state.data.message}
          </p>
        ) : null}
        {error ? (
          <p
            id="notes-error"
            role="alert"
            className="rounded-md bg-secondary px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="internal-notes" className="sr-only">
          Internal notes
        </label>
        <Textarea
          id="internal-notes"
          name="notes"
          rows={5}
          defaultValue={notes ?? ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "notes-error" : undefined}
        />
      </div>

      <SubmitButton />
    </form>
  );
}
