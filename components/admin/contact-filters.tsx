import type { ContactQuery } from "@/lib/admin/contact-view";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { Input } from "@/components/ui/input";

/**
 * Filters for the `/admin/contact` queue. A plain GET form, mirroring
 * `booking-filters.tsx` — see that component's comment for why.
 */
export function ContactFilters({
  query,
  locations,
}: {
  query: ContactQuery;
  locations: { id: string; name: string }[];
}) {
  const { filters, sort } = query;
  const isFiltered = Boolean(
    filters.handled !== undefined || filters.locationId || filters.createdFrom || filters.createdTo,
  );

  return (
    <AdminFilterBar
      action="/admin/contact"
      hidden={[
        { name: "sort", value: sort.column },
        { name: "dir", value: sort.direction },
      ]}
      isFiltered={isFiltered}
      clearHref="/admin/contact"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <label htmlFor="filter-handled" className="block text-xs text-muted-foreground">
            Handled
          </label>
          <select
            id="filter-handled"
            name="handled"
            defaultValue={filters.handled === undefined ? "" : String(filters.handled)}
            className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground"
          >
            <option value="">Either</option>
            <option value="false">Not handled</option>
            <option value="true">Handled</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="filter-location" className="block text-xs text-muted-foreground">
            Branch
          </label>
          <select
            id="filter-location"
            name="location"
            defaultValue={filters.locationId ?? ""}
            className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground"
          >
            <option value="">All branches</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="filter-from" className="block text-xs text-muted-foreground">
            Received from
          </label>
          <Input id="filter-from" name="from" type="date" defaultValue={filters.createdFrom ?? ""} />
        </div>

        <div className="space-y-1">
          <label htmlFor="filter-to" className="block text-xs text-muted-foreground">
            Received to
          </label>
          <Input id="filter-to" name="to" type="date" defaultValue={filters.createdTo ?? ""} />
        </div>
      </div>
    </AdminFilterBar>
  );
}
