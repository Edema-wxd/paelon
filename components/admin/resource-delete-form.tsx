"use client";

import { inSentence } from "@/lib/admin/resource-config";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { RESOURCE_ACTIONS } from "@/lib/admin/resource-action-map";
import type { ResourceState } from "@/lib/admin/resource-actions";
import type { DeleteImpact, DeleteIssue } from "@/lib/admin/delete-impact";
import { RESOURCES, type ResourceName } from "@/lib/admin/resources";

/**
 * Delete a content row, behind a confirmation.
 *
 * The delete is **soft** (spec §8: "All content deletes are soft deletes"), and
 * the dialog says so rather than warning about something permanent — a warning
 * that overstates the consequence is the kind people learn to click through,
 * which is exactly wrong on the screens where it is true.
 *
 * What *is* immediate is the public URL. A type whose rows have one sets
 * `deleteWarning` on its config, and it is shown first and in the destructive
 * colour: reversible in the database is not the same as reversible for the
 * person who followed the link while it was gone.
 *
 * Above the button sits the pre-delete check (`lib/admin/delete-checks.ts`):
 * blockers, which keep the button disabled until they are fixed, and effects,
 * which the editor should know about but which come back on a restore. The
 * action runs the same check, so a stale page cannot delete past it.
 */
function ConfirmButton({
  singular,
  warning,
  blocked,
  effectCount,
}: {
  singular: string;
  warning?: string;
  blocked: boolean;
  effectCount: number;
}) {
  const { pending } = useFormStatus();
  const lower = inSentence(singular);

  return (
    <ConfirmDialog
      triggerLabel={`Delete ${lower}`}
      title={`Delete this ${lower}?`}
      description={
        <>
          {warning ? (
            <p className="font-medium text-destructive">{warning}</p>
          ) : null}
          <p className={warning ? "mt-2" : undefined}>
            It is removed from the site straight away and no longer appears in
            this list. Nothing is erased — an admin can restore it from the
            database if it was a mistake.
          </p>
          {effectCount > 0 ? (
            <p className="mt-2">
              It also changes {effectCount === 1 ? "one other thing" : `${effectCount} other things`},
              listed under “What else changes”.
            </p>
          ) : null}
        </>
      }
      confirmLabel={`Delete ${lower}`}
      cancelLabel="Keep it"
      name="confirm"
      value="delete"
      disabled={pending || blocked}
    />
  );
}

function IssueList({ issues }: { issues: readonly DeleteIssue[] }) {
  return (
    <ul className="mt-3 space-y-3">
      {issues.map((issue) => (
        <li key={issue.title}>
          <p className="text-sm font-medium text-primary">{issue.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed break-words text-muted-foreground">
            {issue.detail}
          </p>
          {issue.items && issue.items.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {issue.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-xs text-primary underline underline-offset-2 hover:no-underline"
                  >
                    Open {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ImpactPanel({ impact }: { impact: DeleteImpact }) {
  return (
    <>
      {impact.blockers.length > 0 ? (
        <section
          aria-labelledby="delete-blockers-heading"
          className="max-w-prose rounded-md border border-destructive/40 bg-secondary p-4"
        >
          <h3 id="delete-blockers-heading" className="text-sm font-semibold text-destructive">
            Can’t be deleted yet
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Deleting it now would break {impact.blockers.length === 1 ? "this" : "these"} on the
            live site. Fix {impact.blockers.length === 1 ? "it" : "them"}, then reload this page.
          </p>
          <IssueList issues={impact.blockers} />
        </section>
      ) : null}

      {impact.effects.length > 0 ? (
        <section
          aria-labelledby="delete-effects-heading"
          className="max-w-prose rounded-md border border-border bg-surface p-4"
        >
          <h3 id="delete-effects-heading" className="text-sm font-semibold text-primary">
            What else changes
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Nothing here breaks, and all of it comes back if it is restored.
          </p>
          <IssueList issues={impact.effects} />
        </section>
      ) : null}
    </>
  );
}

export function ResourceDeleteForm({
  resource,
  id,
  impact = { blockers: [], effects: [] },
}: {
  resource: ResourceName;
  id: string;
  /** From `getDeleteImpact`, read when the page rendered. */
  impact?: DeleteImpact;
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

      <ImpactPanel impact={impact} />

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

      <ConfirmButton
        singular={config.singular}
        {...(config.deleteWarning ? { warning: config.deleteWarning } : {})}
        blocked={impact.blockers.length > 0}
        effectCount={impact.effects.length}
      />
    </form>
  );
}
