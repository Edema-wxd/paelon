import Link from "next/link";

import { PublishedBadge } from "@/components/admin/published-badge";
import { SortableColumnHeader } from "@/components/admin/sortable-column-header";
import type { ResourceConfig } from "@/lib/admin/resource-config";
import {
  resourceAriaSort,
  resourceSortHref,
  type ResourceQuery,
} from "@/lib/admin/resource-view";

/**
 * The list table for any content type the CRUD kit drives.
 *
 * A server component, like every other admin table here: sorting is a link, so
 * each ordering has its own address and the table works with JavaScript off.
 * Cells come from the config's `value` functions, which return strings — that
 * is what keeps this component free of per-type rendering and free of client
 * JavaScript.
 *
 * The draft/published state is a word, not only a colour (spec §12: colour is
 * never the sole indicator). A column sorting on `published` renders as the
 * shared `PublishedBadge`; a config without one gets "Draft" under the title
 * instead, so the state is never missing from the row.
 */
export function ResourceTable<R extends { id: string; published: boolean }>({
  config,
  rows,
  query,
}: {
  config: ResourceConfig<R>;
  rows: readonly R[];
  query: ResourceQuery;
}) {
  const hasStatusColumn = config.columns.some((column) => column.sortKey === "published");
  const sortedColumn = config.columns.find(
    (column) => column.sortKey === query.sort.key,
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          {config.plural}
          {sortedColumn
            ? `, sorted by ${sortedColumn.label}, ${
                query.sort.direction === "asc" ? "ascending" : "descending"
              }`
            : ""}
        </caption>
        <thead>
          <tr className="border-b border-border">
            {config.columns.map((column) =>
              column.sortKey ? (
                <SortableColumnHeader
                  key={column.label}
                  label={column.label}
                  href={resourceSortHref(config, query, column)}
                  ariaSort={resourceAriaSort(query, column)}
                />
              ) : (
                <th key={column.label} scope="col" className="p-3 font-medium text-primary">
                  {column.label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border transition-colors duration-150 last:border-0 hover:bg-secondary/40"
            >
              {config.columns.map((column) => {
                const text = column.value(row);

                if (column.primary) {
                  return (
                    <td key={column.label} className="p-3">
                      <Link
                        href={`/admin/${config.name}/${row.id}`}
                        className="font-medium text-accent underline-offset-4 hover:underline"
                      >
                        {text}
                      </Link>
                      {row.published || hasStatusColumn ? null : (
                        <span className="block text-xs text-muted-foreground">Draft</span>
                      )}
                    </td>
                  );
                }

                if (column.sortKey === "published") {
                  return (
                    <td key={column.label} className="p-3">
                      <PublishedBadge published={row.published} />
                    </td>
                  );
                }

                return (
                  <td key={column.label} className="p-3 text-muted-foreground">
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
