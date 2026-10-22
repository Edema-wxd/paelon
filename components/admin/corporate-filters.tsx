import {
  CORPORATE_COMPANY_SIZE_LABELS,
  CORPORATE_STATUS_LABELS,
  CORPORATE_STATUSES,
  type CorporateQuery,
} from "@/lib/admin/corporate-view";
import type { CompanySize } from "@/lib/db/schema";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { Input } from "@/components/ui/input";

const COMPANY_SIZES = Object.keys(CORPORATE_COMPANY_SIZE_LABELS) as CompanySize[];

/**
 * Filters for the `/admin/corporate-enquiries` queue. A plain GET form,
 * mirroring `booking-filters.tsx`.
 */
export function CorporateFilters({ query }: { query: CorporateQuery }) {
  const { filters, sort } = query;
  const selected = new Set(filters.statuses ?? []);
  const isFiltered =
    selected.size > 0 ||
    Boolean(filters.companySize ?? filters.createdFrom ?? filters.createdTo);

  return (
    <AdminFilterBar
      action="/admin/corporate-enquiries"
      hidden={[
        { name: "sort", value: sort.column },
        { name: "dir", value: sort.direction },
      ]}
      isFiltered={isFiltered}
      clearHref="/admin/corporate-enquiries"
    >
      <fieldset className="border-0 p-0">
        <legend className="text-sm font-medium text-primary">Status</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {CORPORATE_STATUSES.map((status) => (
            <div key={status} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`status-${status}`}
                name="status"
                value={status}
                defaultChecked={selected.has(status)}
                className="size-4 rounded border-input accent-brand-maroon"
              />
              <label htmlFor={`status-${status}`} className="text-sm text-foreground">
                {CORPORATE_STATUS_LABELS[status]}
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="filter-size" className="block text-xs text-muted-foreground">
            Company size
          </label>
          <select
            id="filter-size"
            name="size"
            defaultValue={filters.companySize ?? ""}
            className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground"
          >
            <option value="">Any size</option>
            {COMPANY_SIZES.map((size) => (
              <option key={size} value={size}>
                {CORPORATE_COMPANY_SIZE_LABELS[size]}
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
