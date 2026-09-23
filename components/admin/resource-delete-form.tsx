"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { RESOURCE_ACTIONS } from "@/lib/admin/resource-action-map";
import type { ResourceState } from "@/lib/admin/resource-actions";
import { RESOURCES, type ResourceName } from "@/lib/admin/resources";

/**
 * Delete a content row, behind a confirmation.
 *
 * The delete is **soft** (spec §8: "All content deletes are soft deletes"), and
 * the dialog says so rather than warning about something permanent — a warning
 * that overstates the consequence is the kind people learn to click through,
 * which is exactly wrong on the screens where it is true.
 */
function ConfirmButton({ singular }: { singular: string }) {
  const { pending } = useFormStatus();
  const lower = singular.toLowerCase();

  return (
    <ConfirmDialog
      triggerLabel={`Delete ${lower}`}
      title={`Delete this ${lower}?`}
      description={`It is removed from the site straight away and no longer appears in this list. Nothing is erased — an admin can restore it from the database if it was a mistake.`}
      confirmLabel={`Delete ${lower}`}
      cancelLabel="Keep it"
      name="confirm"
      value="delete"
      disabled={pending}
    />
  );
}

export function ResourceDeleteForm({
  resource,
  id,
}: {
  resource: ResourceName;
  id: string;
}) {
  const config = RESOURCES[resource];
  const router = useRouter();
  const [state, formAction] = useActionState<ResourceState, FormData>(
    async (prev, formData) => RESOURCE_ACTIONS[resource].remove(prev, formData),
    null,
  );

  // The row is gone, so the edit form for it is no longer a page that means
  // anything. Back to the list, where the deletion is visible as an absence.
  useEffect(() => {
    if (state?.ok) router.push(`/admin/${resource}`);
  }, [state, resource, router]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />

      <div aria-live="polite" className="empty:hidden">
        {state && !state.ok ? (
          <p
            role="alert"
            className="rounded-md bg-secondary px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}
      </div>

      <ConfirmButton singular={config.singular} />
    </form>
  );
}
