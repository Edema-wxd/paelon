import Link from "next/link";

import { ariaSort, CONTACT_SORT_LABELS, sortHref, type ContactQuery } from "@/lib/admin/contact-view";
import type { ContactListRow, ContactSortColumn } from "@/lib/db/queries/contact-submissions";
import { SortableColumnHeader } from "@/components/admin/sortable-column-header";

/**
 * The contact-submissions queue table. A server component — unlike bookings,
 * this queue has no bulk actions yet, so there is no client state to lift it
 * for. Sorting stays in the URL via the column headings, which are links.
 */

const COLUMNS: ContactSortColumn[] = ["subject", "handled", "createdAt"];

function formatDate(value: Date): string {
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ContactTable({
  rows,
  query,
}: {
  rows: ContactListRow[];
  query: ContactQuery;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Contact submissions, sorted by {CONTACT_SORT_LABELS[query.sort.column]},{" "}
          {query.sort.direction === "asc" ? "ascending" : "descending"}
        </caption>
        <thead>
          <tr className="border-b border-border">
            {COLUMNS.map((column) => (
              <SortableColumnHeader
                key={column}
                label={CONTACT_SORT_LABELS[column]}
                href={sortHref(query, column)}
                ariaSort={ariaSort(query, column)}
              />
            ))}
            <th scope="col" className="p-3 font-medium text-primary">
              Branch
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              <td className="p-3">
                <Link
                  href={`/admin/contact/${row.id}`}
                  className="font-medium text-accent underline underline-offset-4 hover:no-underline"
                >
                  {row.subject}
                </Link>
                {/* The name, not the message: a list view shows the least that
                    still identifies a row (see bookings-table.tsx). */}
                <span className="block text-xs text-muted-foreground">
                  {row.anonymisedAt ? "Erased" : (row.name ?? "Name withheld")}
                </span>
              </td>
              <td className="p-3">
                {row.handled ? (
                  <span className="text-sm text-foreground">Handled</span>
                ) : (
                  <span className="text-sm font-medium text-primary">Not handled</span>
                )}
              </td>
              <td className="p-3">{formatDate(row.createdAt)}</td>
              <td className="p-3 text-muted-foreground">{row.locationName ?? "Not given"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
