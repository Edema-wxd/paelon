import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  type BookingQuery,
} from "@/lib/admin/booking-view";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { Input } from "@/components/ui/input";

/**
 * Filters for the bookings table.
 *
 * A plain GET form, so the filtered view is a URL: bookmarkable, shareable, and
 * working with the back button. No client state and no JavaScript — submitting
 * navigates, which is what a filter is.
 *
 * Sort and page are deliberately absent as inputs: changing a filter returns to
 * page 1, and the column headings own the sort.
 */

export function BookingFilters({
  query,
  locations,
  assignees,
}: {
  query: BookingQuery;
  locations: { id: string; name: string }[];
  assignees: { id: string; name: string }[];
}) {
  const { filters, sort } = query;
  const selected = new Set(filters.statuses ?? []);
  const isFiltered =
    selected.size > 0 ||
    Boolean(filters.locationId ?? filters.preferredFrom ?? filters.preferredTo ?? filters.assignee);

  return (
    <AdminFilterBar
      action="/admin/bookings"
      hidden={[
        // The sort survives a filter change; the page does not.
        { name: "sort", value: sort.column },
        { name: "dir", value: sort.direction },
      ]}
      isFiltered={isFiltered}
      clearHref="/admin/bookings"
    >
      <fieldset className="border-0 p-0">
        <legend className="text-sm font-medium text-primary">Status</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {BOOKING_STATUSES.map((status) => (
            <div key={status} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`status-${status}`}
                name="status"
                value={status}
                defaultChecked={selected.has(status)}
                className="size-4 rounded border-input accent-[var(--brand-maroon)]"
              />
              <label htmlFor={`status-${status}`} className="text-sm text-foreground">
                {BOOKING_STATUS_LABELS[status]}
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <label htmlFor="filter-assignee" className="block text-xs text-muted-foreground">
            Assigned to
          </label>
          <select
            id="filter-assignee"
            name="assignee"
            defaultValue={filters.assignee ?? ""}
            className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground"
          >
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="filter-from" className="block text-xs text-muted-foreground">
            Preferred date from
          </label>
          <Input
            id="filter-from"
            name="from"
            type="date"
            defaultValue={filters.preferredFrom ?? ""}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="filter-to" className="block text-xs text-muted-foreground">
            Preferred date to
          </label>
          <Input
            id="filter-to"
            name="to"
            type="date"
            defaultValue={filters.preferredTo ?? ""}
          />
        </div>
      </div>
    </AdminFilterBar>
  );
}
