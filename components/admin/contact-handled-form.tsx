"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { markHandledAction, type ContactState } from "@/lib/admin/contact-actions";
import { Button } from "@/components/ui/button";

/**
 * Toggle a contact submission's handled state. Mirrors the shape of
 * `booking-assign-form.tsx` — one field, one submit, one `aria-live` result.
 */

function SubmitButton({ handled }: { handled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Saving…" : handled ? "Mark unhandled" : "Mark handled"}
    </Button>
  );
}

export function ContactHandledForm({
  submissionId,
  handled,
}: {
  submissionId: string;
  handled: boolean;
}) {
  const [state, formAction] = useActionState<ContactState, FormData>(
    async (prev, formData) => markHandledAction(prev, formData),
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="handled" value={String(!handled)} />

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

      <SubmitButton handled={handled} />
    </form>
  );
}
