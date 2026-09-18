"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { BOOKING_STATUS_LABELS } from "@/lib/admin/booking-view";
import { changeStatusAction, type BookingState } from "@/lib/admin/bookings-actions";
import type { BookingStatus } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Move a booking to a new status.
 *
 * `options` comes from `nextStatuses()` on the server, so the dropdown offers
 * only moves the transition map allows for this role. That is a convenience:
 * `changeStatus` re-checks inside its transaction, which is what actually stops
 * an illegal move.
 *
 * Backward moves need a note. The note field is always available rather than
 * appearing on selection, because a field that appears under the cursor is a
 * field people mis-click; it is *required* only for the backward moves listed
 * in `backward`.
 */

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Update status"}
    </Button>
  );
}

export function BookingStatusForm({
  bookingId,
  current,
  options,
  backward,
}: {
  bookingId: string;
  current: BookingStatus;
  options: BookingStatus[];
  /** Of `options`, the ones that move backwards and so require a note. */
  backward: BookingStatus[];
}) {
  const [choice, setChoice] = useState<BookingStatus | "">("");
  const [state, formAction] = useActionState<BookingState, FormData>(
    async (prev, formData) => {
      const result = await changeStatusAction(prev, formData);
      if (result.ok) setChoice("");
      return result;
    },
    null,
  );

  const noteRequired = choice !== "" && backward.includes(choice);
  const noteError = state && !state.ok ? state.fields.note?.[0] : undefined;

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {BOOKING_STATUS_LABELS[current]} is final — this booking cannot move
        again.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />

      <div aria-live="polite" className="empty:hidden">
        {state?.ok ? (
          <p className="rounded-md bg-secondary px-3 py-2 text-sm text-primary">
            {state.data.message}
          </p>
        ) : null}
        {state && !state.ok ? (
          <p
            role="alert"
            className="rounded-md bg-secondary px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="status-to" className="block text-xs text-muted-foreground">
          Move to
        </label>
        <select
          id="status-to"
          name="to"
          required
          value={choice}
          onChange={(event) => setChoice(event.target.value as BookingStatus)}
          className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground"
        >
          <option value="">Choose a status…</option>
          {options.map((status) => (
            <option key={status} value={status}>
              {BOOKING_STATUS_LABELS[status]}
              {backward.includes(status) ? " (back — note required)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="status-note" className="block text-xs text-muted-foreground">
          Note {noteRequired ? "(required)" : "(optional)"}
        </label>
        <Textarea
          id="status-note"
          name="note"
          rows={2}
          required={noteRequired}
          aria-invalid={noteError ? true : undefined}
          aria-describedby={noteError ? "status-note-error" : undefined}
        />
        {noteError ? (
          <p id="status-note-error" className="text-xs text-destructive">
            {noteError}
          </p>
        ) : null}
        {/* The note joins the timeline, which is staff-visible and kept as a
            record — so it is not the place for clinical detail. */}
        <p className="text-xs text-muted-foreground">
          Shown in the timeline below. Keep it about the booking, not the
          patient&rsquo;s health.
        </p>
      </div>

      <SubmitButton />
    </form>
  );
}
