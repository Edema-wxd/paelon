"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { assignAction, type BookingState } from "@/lib/admin/bookings-actions";
import { Button } from "@/components/ui/button";

/**
 * Assign a booking to an editor or admin, or unassign it.
 *
 * `staff` is its own query (`listAssignableUsers`), not the staff list: editors
 * assign bookings but may not read staff emails or lock state (§8, B2).
 */

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function BookingAssignForm({
  bookingId,
  assignedToUserId,
  staff,
}: {
  bookingId: string;
  assignedToUserId: string | null;
  staff: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState<BookingState, FormData>(
    async (prev, formData) => assignAction(prev, formData),
    null,
  );

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
        <label htmlFor="assign-user" className="block text-xs text-muted-foreground">
          Assigned to
        </label>
        <select
          id="assign-user"
          name="userId"
          defaultValue={assignedToUserId ?? ""}
          className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground"
        >
          <option value="">Unassigned</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>

      <SubmitButton />
    </form>
  );
}
