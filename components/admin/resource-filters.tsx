import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { Input } from "@/components/ui/input";
import type { ResourceConfig } from "@/lib/admin/resource-config";
import { DEFAULT_SORT, type ResourceQuery } from "@/lib/admin/resource-view";

/**
 * Status and search for a CRUD list view, on `AdminFilterBar`'s GET shell — so
 * the filtered list is a URL and needs no client JavaScript.
 *
 * The sort is carried through as hidden fields rather than reset on filter, or
 * applying a filter would silently throw away the ordering someone chose.
 */
export function ResourceFilters<R>({
  config,
  query,
  showMine,
}: {
  config: ResourceConfig<R>;
  query: ResourceQuery;
  /** The "only mine" toggle, shown to a role that can only edit its own rows. */
  showMine: boolean;
}) {
  const action = `/admin/${config.name}`;
  const hidden: { name: string; value: string }[] = [];
  if (query.sort.key !== DEFAULT_SORT.key) {
    hidden.push({ name: "sort", value: query.sort.key });
  }
  if (query.sort.direction !== DEFAULT_SORT.direction) {
    hidden.push({ name: "dir", value: query.sort.direction });
  }

  const isFiltered =
    query.status !== undefined || query.search !== undefined || query.mine;

  return (
    <AdminFilterBar
      action={action}
      hidden={hidden}
      isFiltered={isFiltered}
      clearHref={action}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label
            htmlFor="resource-status"
            className="block text-xs text-muted-foreground"
          >
            Status
          </label>
          <select
            id="resource-status"
            name="status"
            defaultValue={query.status ?? ""}
            className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground"
          >
            <option value="">All</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="resource-search" className="block text-xs text-muted-foreground">
            Search
          </label>
          <Input
            id="resource-search"
            name="q"
            type="search"
            defaultValue={query.search ?? ""}
            maxLength={100}
            autoComplete="off"
          />
        </div>
      </div>

      {showMine ? (
        <div className="mt-4 flex items-start gap-2">
          <input
            id="resource-mine"
            name="mine"
            type="checkbox"
            value="1"
            defaultChecked={query.mine}
            className="mt-0.5 size-4 rounded border-input"
          />
          <label htmlFor="resource-mine" className="text-sm text-foreground">
            Only the ones I created
          </label>
        </div>
      ) : null}
    </AdminFilterBar>
  );
}
