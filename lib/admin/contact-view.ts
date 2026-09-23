import type {
  ContactListFilters,
  ContactListSort,
  ContactSortColumn,
} from "@/lib/db/queries/contact-submissions";

import { paginate, type AdminPagination } from "@/lib/admin/list-view";

export { paginate, type AdminPagination };

/**
 * The `/admin/contact` view state, which lives entirely in the URL. Mirrors
 * `lib/admin/booking-view.ts` — see that module's comment for why filters,
 * sort and page are query parameters rather than client state.
 */

export const CONTACT_SORT_LABELS: Record<ContactSortColumn, string> = {
  createdAt: "Received",
  subject: "Subject",
  handled: "Handled",
};

const SORT_COLUMNS = Object.keys(CONTACT_SORT_LABELS) as ContactSortColumn[];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface ContactQuery {
  filters: ContactListFilters;
  sort: ContactListSort;
  page: number;
}

export const DEFAULT_CONTACT_SORT: ContactListSort = {
  column: "createdAt",
  direction: "desc",
};

function first(value: string | string[] | undefined): string | undefined {
  const found = Array.isArray(value) ? value[0] : value;
  const trimmed = found?.trim();
  return trimmed ? trimmed : undefined;
}

function isoDate(value: string | undefined): string | undefined {
  if (!value || !ISO_DATE.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

/** Read filters, sort and page out of the URL, dropping anything invalid. */
export function parseContactQuery(params: RawSearchParams): ContactQuery {
  const handled = first(params.handled);
  const locationId = first(params.location);
  const column = first(params.sort);
  const direction = first(params.dir);
  const page = Number.parseInt(first(params.page) ?? "1", 10);

  const filters: ContactListFilters = {};
  if (handled === "true") filters.handled = true;
  else if (handled === "false") filters.handled = false;
  if (locationId && UUID.test(locationId)) filters.locationId = locationId;
  const from = isoDate(first(params.from));
  const to = isoDate(first(params.to));
  if (from) filters.createdFrom = from;
  if (to) filters.createdTo = to;

  return {
    filters,
    sort: {
      column:
        column && (SORT_COLUMNS as string[]).includes(column)
          ? (column as ContactSortColumn)
          : DEFAULT_CONTACT_SORT.column,
      direction: direction === "asc" ? "asc" : "desc",
    },
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** The query string for a view, with empty values left out. */
export function contactHref(
  query: ContactQuery,
  overrides: { sort?: ContactListSort; page?: number } = {},
): string {
  const sort = overrides.sort ?? query.sort;
  const page = overrides.page ?? query.page;
  const { filters } = query;
  const search = new URLSearchParams();

  if (filters.handled !== undefined) search.set("handled", String(filters.handled));
  if (filters.locationId) search.set("location", filters.locationId);
  if (filters.createdFrom) search.set("from", filters.createdFrom);
  if (filters.createdTo) search.set("to", filters.createdTo);
  if (sort.column !== DEFAULT_CONTACT_SORT.column) search.set("sort", sort.column);
  if (sort.direction !== DEFAULT_CONTACT_SORT.direction) search.set("dir", sort.direction);
  if (page > 1) search.set("page", String(page));

  const queryString = search.toString();
  return queryString ? `/admin/contact?${queryString}` : "/admin/contact";
}

/** The link for a column heading: same column flips direction, else starts descending. */
export function sortHref(query: ContactQuery, column: ContactSortColumn): string {
  const direction =
    query.sort.column === column && query.sort.direction === "desc" ? "asc" : "desc";
  return contactHref(query, { sort: { column, direction }, page: 1 });
}

/** `aria-sort` for a column heading. */
export function ariaSort(
  query: ContactQuery,
  column: ContactSortColumn,
): "ascending" | "descending" | "none" {
  if (query.sort.column !== column) return "none";
  return query.sort.direction === "asc" ? "ascending" : "descending";
}
