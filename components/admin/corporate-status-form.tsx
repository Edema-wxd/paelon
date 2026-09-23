"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { CORPORATE_STATUS_LABELS, CORPORATE_STATUSES } from "@/lib/admin/corporate-view";
import { changeCorporateStatusAction, type CorporateState } from "@/lib/admin/corporate-actions";
import type { CorporateStatus } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";

/**
 * Move a corporate enquiry to a new status. Unlike `booking-status-form.tsx`,
 * every status is offered — there is no transition graph for a sales pipeline
 * (see `changeCorporateStatus`'s comment in `lib/db/queries/corporate-enquiries.ts`).
 */

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Update status"}
    </Button>
  );
}

export function CorporateStatusForm({
  enquiryId,
  current,
}: {
  enquiryId: string;
  current: CorporateStatus;
}) {
  const [state, formAction] = useActionState<CorporateState, FormData>(
    async (prev, formData) => changeCorporateStatusAction(prev, formData),
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="enquiryId" value={enquiryId} />

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
        <label htmlFor="corporate-status-to" className="block text-xs text-muted-foreground">
          Move to
        </label>
        <select
          id="corporate-status-to"
          name="to"
          required
          defaultValue={current}
          className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground"
        >
          {CORPORATE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {CORPORATE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <SubmitButton />
    </form>
  );
}
