import Link from "next/link";

import {
  ariaSort,
  CORPORATE_COMPANY_SIZE_LABELS,
  CORPORATE_SORT_LABELS,
  sortHref,
  type CorporateQuery,
} from "@/lib/admin/corporate-view";
import type { CorporateListRow, CorporateSortColumn } from "@/lib/db/queries/corporate-enquiries";
import { CorporateStatusBadge } from "@/components/admin/corporate-status-badge";
import { SortableColumnHeader } from "@/components/admin/sortable-column-header";

/**
 * The corporate enquiries queue table. Mirrors `contact-table.tsx`: a server
 * component, no bulk actions, sorting via the URL through the column links.
 */

const COLUMNS: CorporateSortColumn[] = ["companyName", "status", "createdAt"];

function formatDate(value: Date): string {
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CorporateTable({
  rows,
  query,
}: {
  rows: CorporateListRow[];
  query: CorporateQuery;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Corporate enquiries, sorted by {CORPORATE_SORT_LABELS[query.sort.column]},{" "}
          {query.sort.direction === "asc" ? "ascending" : "descending"}
        </caption>
        <thead>
          <tr className="border-b border-border">
            {COLUMNS.map((column) => (
              <SortableColumnHeader
                key={column}
                label={CORPORATE_SORT_LABELS[column]}
                href={sortHref(query, column)}
                ariaSort={ariaSort(query, column)}
              />
            ))}
            <th scope="col" className="p-3 font-medium text-primary">
              Company size
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              <td className="p-3">
                <Link
                  href={`/admin/corporate-enquiries/${row.id}`}
                  className="font-medium text-accent underline underline-offset-4 hover:no-underline"
                >
                  {row.companyName}
                </Link>
                {/* The contact's name, not their email or phone — least that
                    still identifies a row (see bookings-table.tsx). */}
                <span className="block text-xs text-muted-foreground">
                  {row.anonymisedAt ? "Erased" : (row.contactName ?? "Name withheld")}
                </span>
              </td>
              <td className="p-3">
                <CorporateStatusBadge status={row.status} />
              </td>
              <td className="p-3">{formatDate(row.createdAt)}</td>
              <td className="p-3 text-muted-foreground">
                {CORPORATE_COMPANY_SIZE_LABELS[row.companySize]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
