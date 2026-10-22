import { paginate, type AdminPagination } from "@/lib/admin/list-view";
import type { Column, ResourceConfig } from "@/lib/admin/resource-config";

export { paginate, type AdminPagination };

/**
 * The URL state of a CRUD list view — status filter, search, sort, page.
 *
 * Generic where `booking-view.ts`, `contact-view.ts` and `corporate-view.ts`
 * are per-resource, because a content list has the same four controls whatever
 * it lists. Those three stay as they are: their filters are resource-specific
 * (branch, assigned staff, company size) and a generic version would be a
 * worse fit, not a shared one.
 *
 * Pure and DB-free, so it is unit-tested without a database.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface ResourceQuery {
  status?: "published" | "draft";
  search?: string;
  sort: { key: string; direction: "asc" | "desc" };
  page: number;
  /** Only my rows — the contributor's view of a shared list. */
  mine: boolean;
}

/** Sorted by `order` ascending, which is what the column is for. */
export const DEFAULT_SORT = { key: "order", direction: "asc" as const };

function first(value: string | string[] | undefined): string | undefined {
  const found = Array.isArray(value) ? value[0] : value;
  const trimmed = found?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Read the view state out of the URL, dropping anything invalid.
 *
 * An unrecognised sort key falls back to the default rather than erroring: a
 * stale bookmark should show the list, not a crash. It is also what stops a
 * hand-edited `?sort=password_hash` from reaching a query — only keys a column
 * declares are accepted.
 */
export function parseResourceQuery<R>(
  config: ResourceConfig<R>,
  params: RawSearchParams,
): ResourceQuery {
  const status = first(params.status);
  const sortKey = first(params.sort);
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  const allowed = sortableKeys(config);

  const query: ResourceQuery = {
    sort: {
      key: sortKey && allowed.includes(sortKey) ? sortKey : DEFAULT_SORT.key,
      direction: first(params.dir) === "desc" ? "desc" : "asc",
    },
    page: Number.isFinite(page) && page > 0 ? page : 1,
    mine: first(params.mine) === "1",
  };

  if (status === "published" || status === "draft") query.status = status;
  const search = first(params.q);
  if (search) query.search = search.slice(0, 100);

  return query;
}

/** The sort keys a resource's columns declare. */
export function sortableKeys<R>(config: ResourceConfig<R>): string[] {
  return config.columns
    .map((column) => column.sortKey)
    .filter((key): key is string => key !== undefined);
}

/** The query string for a view, with defaults left out so URLs stay short. */
export function resourceListHref(
  name: string,
  query: ResourceQuery,
  overrides: Partial<Pick<ResourceQuery, "sort" | "page" | "status">> = {},
): string {
  const sort = overrides.sort ?? query.sort;
  const page = overrides.page ?? query.page;
  const status = "status" in overrides ? overrides.status : query.status;

  const search = new URLSearchParams();
  if (status) search.set("status", status);
  if (query.search) search.set("q", query.search);
  if (query.mine) search.set("mine", "1");
  if (sort.key !== DEFAULT_SORT.key) search.set("sort", sort.key);
  if (sort.direction !== DEFAULT_SORT.direction) search.set("dir", sort.direction);
  if (page > 1) search.set("page", String(page));

  const queryString = search.toString();
  return queryString ? `/admin/${name}?${queryString}` : `/admin/${name}`;
}

/**
 * The link for a column heading: the current column flips direction, any other
 * starts ascending. Always returns to page 1 — page 3 of a different ordering
 * is a different set of rows, and landing there looks like data loss.
 */
export function resourceSortHref<R>(
  config: ResourceConfig<R>,
  query: ResourceQuery,
  column: Column<R>,
): string {
  const key = column.sortKey;
  if (!key) return resourceListHref(config.name, query);

  const direction =
    query.sort.key === key && query.sort.direction === "asc" ? "desc" : "asc";
  return resourceListHref(config.name, query, {
    sort: { key, direction },
    page: 1,
  });
}

/** `aria-sort` for a column heading. */
export function resourceAriaSort<R>(
  query: ResourceQuery,
  column: Column<R>,
): "ascending" | "descending" | "none" {
  if (!column.sortKey || query.sort.key !== column.sortKey) return "none";
  return query.sort.direction === "asc" ? "ascending" : "descending";
}
