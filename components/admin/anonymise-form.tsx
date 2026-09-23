"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import type { ActionResult, ActionState } from "@/lib/admin/action";

/**
 * "Erase personal data" behind a confirmation, shared by `/admin/contact` and
 * `/admin/corporate-enquiries`. Admin-only — the action itself re-checks via
 * `can(role, "delete", resource)`, this is only where the button renders.
 *
 * Generic over the action's message shape so both resources' server actions
 * (which return `{ message }`) can be passed directly.
 */
function ConfirmButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <ConfirmDialog
      triggerLabel="Erase personal data"
      title="Erase this record's personal data?"
      description="This removes the personal details permanently and cannot be undone. Operational fields used for reporting are kept."
      confirmLabel="Erase personal data"
      cancelLabel="Keep it"
      name="confirm"
      value="erase"
      disabled={disabled || pending}
    />
  );
}

export function AnonymiseForm<T extends { message: string }>({
  action,
  hiddenField,
  hiddenValue,
}: {
  action: (
    prev: ActionState<T>,
    formData: FormData,
  ) => Promise<ActionResult<T>>;
  /** The hidden field name the action's schema expects, e.g. `submissionId`. */
  hiddenField: string;
  hiddenValue: string;
}) {
  const [state, formAction] = useActionState<ActionState<T>, FormData>(
    async (prev, formData) => action(prev, formData),
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name={hiddenField} value={hiddenValue} />

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

      <ConfirmButton disabled={Boolean(state?.ok)} />
    </form>
  );
}
