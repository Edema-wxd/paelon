"use client";

import { Check, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { CORPORATE_STATUS_LABELS } from "@/lib/admin/corporate-view";
import { changeCorporateStatusAction, type CorporateState } from "@/lib/admin/corporate-actions";
import type { CorporateStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/**
 * Move a corporate enquiry along its pipeline in one click.
 *
 * Each stage is its own submit button carrying `to`, so moving an enquiry is
 * one press rather than open-a-select, choose, then "Update status". Unlike
 * `booking-status-form.tsx`, every status is offered — there is no transition
 * graph for a sales pipeline (see `changeCorporateStatus`'s comment in
 * `lib/db/queries/corporate-enquiries.ts`) — so the outcome stages sit apart
 * from the working ones rather than after them.
 *
 * The current stage is marked with a tick and `aria-pressed`, not by colour
 * alone, and is disabled because re-submitting it would only write a no-op
 * audit row.
 */

const WORKING: CorporateStatus[] = ["new", "contacted", "proposal_sent"];
const OUTCOMES: CorporateStatus[] = ["won", "lost"];

function StageButton({ status, current }: { status: CorporateStatus; current: CorporateStatus }) {
  const { pending, data } = useFormStatus();
  const isCurrent = status === current;
  const isSaving = pending && data?.get("to") === status;

  return (
    <button
      type="submit"
      name="to"
      value={status}
      disabled={isCurrent || pending}
      aria-pressed={isCurrent}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-[background-color,border-color,transform] duration-150 ease-out",
        isCurrent
          ? "border-primary bg-primary font-medium text-primary-foreground"
          : "border-border bg-surface text-primary hover:border-primary/40 hover:bg-secondary/60 active:scale-[0.98] disabled:opacity-60",
      )}
    >
      {CORPORATE_STATUS_LABELS[status]}
      {isSaving ? (
        <Loader2 aria-hidden className="size-4 animate-spin" />
      ) : isCurrent ? (
        <Check aria-hidden className="size-4" />
      ) : null}
    </button>
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

      <fieldset>
        <legend className="sr-only">Move this enquiry to</legend>
        <div className="space-y-1.5">
          {WORKING.map((status) => (
            <StageButton key={status} status={status} current={current} />
          ))}
        </div>
        <p className="mt-3 mb-1.5 text-xs text-muted-foreground">Outcome</p>
        <div className="grid grid-cols-2 gap-1.5">
          {OUTCOMES.map((status) => (
            <StageButton key={status} status={status} current={current} />
          ))}
        </div>
      </fieldset>

      <div aria-live="polite" className="empty:hidden">
        {state?.ok ? (
          <p className="rounded-md bg-secondary px-3 py-2 text-sm text-primary">
            {state.data.message}
          </p>
        ) : null}
        {state && !state.ok ? (
          <p role="alert" className="rounded-md bg-secondary px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
