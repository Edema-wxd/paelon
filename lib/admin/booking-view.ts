import type {
  BookingListFilters,
  BookingListSort,
  BookingSortColumn,
} from "@/lib/db/queries/bookings";
import type { BookingStatus } from "@/lib/db/schema";

import { paginate, type AdminPagination } from "@/lib/admin/list-view";

export { paginate, type AdminPagination };
/** @deprecated Use `AdminPagination` from `lib/admin/list-view`. Kept as an alias so this module's existing exports keep working. */
export type BookingPagination = AdminPagination;

/**
 * The `/admin/bookings` view state, which lives entirely in the URL.
 *
 * Filters, sort and page are query parameters rather than client state, so a
 * filtered view is a link someone can bookmark or send to a colleague, the
 * back button works, and the table stays a server component with no store to
 * keep in sync (CLAUDE.md: no state library).
 *
 * Everything here is pure, so the parsing is unit-tested without a database.
 * Nothing trusts the input: an unknown status, a malformed date or a negative
 * page is dropped rather than passed to the query layer.
 *
 * The bookings table is a client component, so this module imports the schema
 * and the query layer for their *types* only. A value import from either would
 * pull Drizzle and the Neon driver into the browser bundle (CLAUDE.md).
 */

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  new: "New",
  contacted: "Contacted",
  confirmed: "Confirmed",
  completed: "Completed",
  no_show: "No show",
  cancelled: "Cancelled",
};

export const BOOKING_SORT_LABELS: Record<BookingSortColumn, string> = {
  preferredDate: "Preferred date",
  createdAt: "Received",
  status: "Status",
  reference: "Reference",
};

const SORT_COLUMNS = Object.keys(BOOKING_SORT_LABELS) as BookingSortColumn[];

/** The enum values, restated so this module never imports the schema itself. */
export const BOOKING_STATUSES = Object.keys(
  BOOKING_STATUS_LABELS,
) as BookingStatus[];

/** `YYYY-MM-DD`, and a real date — `2026-02-31` is not one. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Next's `searchParams`, before any of it is trusted. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface BookingQuery {
  filters: BookingListFilters;
  sort: BookingListSort;
  page: number;
}

export const DEFAULT_BOOKING_SORT: BookingListSort = {
  column: "preferredDate",
  direction: "asc",
};

function first(value: string | string[] | undefined): string | undefined {
  const found = Array.isArray(value) ? value[0] : value;
  const trimmed = found?.trim();
  return trimmed ? trimmed : undefined;
}

function all(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).flatMap((entry) =>
    entry.split(",").map((part) => part.trim()).filter(Boolean),
  );
}

function isoDate(value: string | undefined): string | undefined {
  if (!value || !ISO_DATE.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  // Round-trip catches `2026-02-31`, which `Date` rolls forward to 3 March.
  return parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

function isStatus(value: string): value is BookingStatus {
  return (BOOKING_STATUSES as string[]).includes(value);
}

/** Read filters, sort and page out of the URL, dropping anything invalid. */
export function parseBookingQuery(params: RawSearchParams): BookingQuery {
  const statuses = all(params.status).filter(isStatus);
  const assignee = first(params.assignee);
  const locationId = first(params.location);
  const column = first(params.sort);
  const direction = first(params.dir);
  const page = Number.parseInt(first(params.page) ?? "1", 10);

  const filters: BookingListFilters = {};
  if (statuses.length > 0) filters.statuses = [...new Set(statuses)];
  if (locationId && UUID.test(locationId)) filters.locationId = locationId;
  const from = isoDate(first(params.from));
  const to = isoDate(first(params.to));
  if (from) filters.preferredFrom = from;
  if (to) filters.preferredTo = to;
  // "unassigned" is a filter value, not an id — see `listConditions`.
  if (assignee === "unassigned" || (assignee && UUID.test(assignee))) {
    filters.assignee = assignee;
  }

  return {
    filters,
    sort: {
      column:
        column && (SORT_COLUMNS as string[]).includes(column)
          ? (column as BookingSortColumn)
          : DEFAULT_BOOKING_SORT.column,
      direction: direction === "desc" ? "desc" : "asc",
    },
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** The query string for a view, with empty values left out. */
export function bookingHref(
  query: BookingQuery,
  overrides: { sort?: BookingListSort; page?: number } = {},
): string {
  const sort = overrides.sort ?? query.sort;
  const page = overrides.page ?? query.page;
  const { filters } = query;
  const search = new URLSearchParams();

  for (const status of filters.statuses ?? []) search.append("status", status);
  if (filters.locationId) search.set("location", filters.locationId);
  if (filters.preferredFrom) search.set("from", filters.preferredFrom);
  if (filters.preferredTo) search.set("to", filters.preferredTo);
  if (filters.assignee) search.set("assignee", filters.assignee);
  if (sort.column !== DEFAULT_BOOKING_SORT.column) search.set("sort", sort.column);
  if (sort.direction !== DEFAULT_BOOKING_SORT.direction) search.set("dir", sort.direction);
  if (page > 1) search.set("page", String(page));

  const queryString = search.toString();
  return queryString ? `/admin/bookings?${queryString}` : "/admin/bookings";
}

/**
 * The link for a column heading: the same column flips direction, a different
 * column starts ascending. Either way the view returns to page 1, because page
 * 4 of one ordering is not page 4 of another.
 */
export function sortHref(query: BookingQuery, column: BookingSortColumn): string {
  const direction =
    query.sort.column === column && query.sort.direction === "asc" ? "desc" : "asc";
  return bookingHref(query, { sort: { column, direction }, page: 1 });
}

/** `aria-sort` for a column heading. */
export function ariaSort(
  query: BookingQuery,
  column: BookingSortColumn,
): "ascending" | "descending" | "none" {
  if (query.sort.column !== column) return "none";
  return query.sort.direction === "asc" ? "ascending" : "descending";
}

