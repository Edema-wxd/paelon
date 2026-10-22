"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  ariaSort,
  BOOKING_SORT_LABELS,
  sortHref,
  type BookingQuery,
} from "@/lib/admin/booking-view";
import {
  bulkAssignToMeAction,
  bulkMarkCancelledAction,
  bulkMarkContactedAction,
  type BulkSkip,
  type BulkState,
} from "@/lib/admin/bookings-actions";
import type { BookingListRow, BookingSortColumn } from "@/lib/db/queries/bookings";
import { BookingStatusBadge } from "@/components/admin/booking-status-badge";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { SortableColumnHeader } from "@/components/admin/sortable-column-header";
import { Button } from "@/components/ui/button";

/**
 * The bookings table, with row selection and bulk actions.
 *
 * Client-side only for the selection checkboxes and the result message. Sorting
 * and filtering stay in the URL and are handled by the server — the column
 * headings are links, so sorting works without JavaScript and each ordering has
 * its own address.
 *
 * One form and one `useActionState` for all three bulk actions, dispatched on
 * the submitting button's `intent`. That gives the toolbar a single `aria-live`
 * region rather than three competing to announce.
 *
 * Bulk actions skip rows they cannot change rather than failing the batch, so
 * the result says how many moved and why the rest did not.
 */

const SKIP_REASONS: Record<BulkSkip["reason"], string> = {
  not_found: "no longer exists",
  actor_invalid: "not permitted",
  unchanged: "already had that status",
  illegal: "cannot move there from its current status",
  admin_only: "needs an admin",
  note_required: "needs a note",
  assignee_invalid: "cannot be assigned",
};

const COLUMNS: BookingSortColumn[] = [
  "reference",
  "preferredDate",
  "status",
  "createdAt",
];

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function BulkButton({
  intent,
  children,
  disabled,
}: {
  intent: string;
  children: string;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      name="intent"
      value={intent}
      variant="outline"
      size="sm"
      disabled={disabled || pending}
    >
      {children}
    </Button>
  );
}

/**
 * "Mark cancelled", behind a confirmation. Split out so it can read
 * `useFormStatus`, which only reports the enclosing form from a child.
 */
function BulkCancelButton({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <ConfirmDialog
      triggerLabel="Mark cancelled"
      title={count === 1 ? "Cancel this booking?" : `Cancel ${count} bookings?`}
      description={
        <>
          The {count === 1 ? "patient" : "patients"} will not be expected at the
          branch. Only an admin can reverse this, and they will have to record a
          reason.
        </>
      }
      confirmLabel={count === 1 ? "Cancel booking" : `Cancel ${count} bookings`}
      cancelLabel="Keep them"
      name="intent"
      value="cancelled"
      disabled={count === 0 || pending}
    />
  );
}

export function BookingsTable({
  rows,
  query,
  canAct,
}: {
  rows: BookingListRow[];
  query: BookingQuery;
  /** Whether bulk controls render. The actions re-check on the server. */
  canAct: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [state, formAction] = useActionState<BulkState, FormData>(
    async (prev, formData) => {
      const intent = formData.get("intent");
      const action =
        intent === "contacted"
          ? bulkMarkContactedAction
          : intent === "cancelled"
            ? bulkMarkCancelledAction
            : intent === "assign"
              ? bulkAssignToMeAction
              : null;

      if (!action) return { ok: false, error: "Unknown action.", fields: {} };

      const result = await action(prev, formData);
      if (result.ok) setSelected(new Set());
      return result;
    },
    null,
  );

  const skipped = state
    ? state.ok
      ? state.data.skipped
      : (state.details ?? [])
    : [];

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) =>
      current.size === rows.length ? new Set() : new Set(rows.map((row) => row.id)),
    );
  }

  return (
    <form action={formAction}>
      <div aria-live="polite" className="mb-4 empty:mb-0">
        {state?.ok ? (
          <p className="rounded-md border-l-2 border-accent bg-white px-4 py-3 text-sm text-primary">
            Updated {state.data.changed}{" "}
            {state.data.changed === 1 ? "booking" : "bookings"}.
          </p>
        ) : null}
        {state && !state.ok ? (
          <p
            role="alert"
            className="rounded-md border-l-2 border-destructive bg-white px-4 py-3 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}
        {skipped.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {skipped.map((skip) => {
              const row = rows.find((candidate) => candidate.id === skip.bookingId);
              return (
                <li key={skip.bookingId}>
                  {row?.reference ?? "A booking"} — {SKIP_REASONS[skip.reason]}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {canAct ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {selected.size} selected
          </p>
          <BulkButton intent="assign" disabled={selected.size === 0}>
            Assign to me
          </BulkButton>
          <BulkButton intent="contacted" disabled={selected.size === 0}>
            Mark contacted
          </BulkButton>
          {/* Cancelling is the one bulk action with no way back for an editor:
              `cancelled` has no forward edges, so undoing it is an admin-only
              backward move that needs a note. It asks first. */}
          <BulkCancelButton count={selected.size} />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Bookings, sorted by {BOOKING_SORT_LABELS[query.sort.column]},{" "}
            {query.sort.direction === "asc" ? "ascending" : "descending"}
          </caption>
          <thead>
            <tr className="border-b border-border">
              {canAct ? (
                <th scope="col" className="w-10 p-3">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                    aria-label="Select all bookings on this page"
                    className="size-4 rounded border-input accent-[var(--brand-maroon)]"
                  />
                </th>
              ) : null}
              {COLUMNS.map((column) => (
                <SortableColumnHeader
                  key={column}
                  label={BOOKING_SORT_LABELS[column]}
                  href={sortHref(query, column)}
                  ariaSort={ariaSort(query, column)}
                />
              ))}
              <th scope="col" className="p-3 font-medium text-primary">
                Branch
              </th>
              <th scope="col" className="p-3 font-medium text-primary">
                Assigned to
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                {canAct ? (
                  <td className="p-3">
                    <input
                      type="checkbox"
                      name="bookingIds"
                      value={row.id}
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      aria-label={`Select booking ${row.reference}`}
                      className="size-4 rounded border-input accent-[var(--brand-maroon)]"
                    />
                  </td>
                ) : null}
                <td className="p-3">
                  <Link
                    href={`/admin/bookings/${row.id}`}
                    className="font-mono text-[13px] font-medium tracking-tight text-accent underline underline-offset-4 hover:no-underline"
                  >
                    {row.reference}
                  </Link>
                  {/* The patient's name, not their phone or reason for visit:
                      a list view shows the least that still identifies a row. */}
                  <span className="block text-xs text-muted-foreground">
                    {row.patientName ?? "Name withheld"}
                  </span>
                </td>
                <td className="p-3">{formatDate(row.preferredDate)}</td>
                {/* Status as a word first; the badge's colour only repeats it. */}
                <td className="p-3">
                  <BookingStatusBadge status={row.status} />
                </td>
                <td className="p-3">{formatDate(row.createdAt)}</td>
                <td className="p-3">{row.locationName}</td>
                <td className="p-3 text-muted-foreground">
                  {row.assigneeName ?? "Unassigned"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
