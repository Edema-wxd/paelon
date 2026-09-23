import type {
  CorporateListFilters,
  CorporateListSort,
  CorporateSortColumn,
} from "@/lib/db/queries/corporate-enquiries";
import type { CompanySize, CorporateStatus } from "@/lib/db/schema";

import { paginate, type AdminPagination } from "@/lib/admin/list-view";

export { paginate, type AdminPagination };

/**
 * The `/admin/corporate-enquiries` view state, which lives entirely in the
 * URL. Mirrors `lib/admin/booking-view.ts` and `lib/admin/contact-view.ts`.
 */

export const CORPORATE_STATUS_LABELS: Record<CorporateStatus, string> = {
  new: "New",
  contacted: "Contacted",
  proposal_sent: "Proposal sent",
  won: "Won",
  lost: "Lost",
};

export const CORPORATE_SORT_LABELS: Record<CorporateSortColumn, string> = {
  createdAt: "Received",
  companyName: "Company",
  status: "Status",
};

export const CORPORATE_COMPANY_SIZE_LABELS: Record<CompanySize, string> = {
  "1_50": "1–50",
  "51_200": "51–200",
  "201_500": "201–500",
  "501_1000": "501–1,000",
  "1000_plus": "1,000+",
};

const SORT_COLUMNS = Object.keys(CORPORATE_SORT_LABELS) as CorporateSortColumn[];
export const CORPORATE_STATUSES = Object.keys(
  CORPORATE_STATUS_LABELS,
) as CorporateStatus[];
const COMPANY_SIZES = Object.keys(CORPORATE_COMPANY_SIZE_LABELS) as CompanySize[];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface CorporateQuery {
  filters: CorporateListFilters;
  sort: CorporateListSort;
  page: number;
}

export const DEFAULT_CORPORATE_SORT: CorporateListSort = {
  column: "createdAt",
  direction: "desc",
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
  return parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

function isStatus(value: string): value is CorporateStatus {
  return (CORPORATE_STATUSES as string[]).includes(value);
}

function isCompanySize(value: string): value is CompanySize {
  return (COMPANY_SIZES as string[]).includes(value);
}

/** Read filters, sort and page out of the URL, dropping anything invalid. */
export function parseCorporateQuery(params: RawSearchParams): CorporateQuery {
  const statuses = all(params.status).filter(isStatus);
  const companySize = first(params.size);
  const column = first(params.sort);
  const direction = first(params.dir);
  const page = Number.parseInt(first(params.page) ?? "1", 10);

  const filters: CorporateListFilters = {};
  if (statuses.length > 0) filters.statuses = [...new Set(statuses)];
  if (companySize && isCompanySize(companySize)) filters.companySize = companySize;
  const from = isoDate(first(params.from));
  const to = isoDate(first(params.to));
  if (from) filters.createdFrom = from;
  if (to) filters.createdTo = to;

  return {
    filters,
    sort: {
      column:
        column && (SORT_COLUMNS as string[]).includes(column)
          ? (column as CorporateSortColumn)
          : DEFAULT_CORPORATE_SORT.column,
      direction: direction === "asc" ? "asc" : "desc",
    },
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** The query string for a view, with empty values left out. */
export function corporateHref(
  query: CorporateQuery,
  overrides: { sort?: CorporateListSort; page?: number } = {},
): string {
  const sort = overrides.sort ?? query.sort;
  const page = overrides.page ?? query.page;
  const { filters } = query;
  const search = new URLSearchParams();

  for (const status of filters.statuses ?? []) search.append("status", status);
  if (filters.companySize) search.set("size", filters.companySize);
  if (filters.createdFrom) search.set("from", filters.createdFrom);
  if (filters.createdTo) search.set("to", filters.createdTo);
  if (sort.column !== DEFAULT_CORPORATE_SORT.column) search.set("sort", sort.column);
  if (sort.direction !== DEFAULT_CORPORATE_SORT.direction) search.set("dir", sort.direction);
  if (page > 1) search.set("page", String(page));

  const queryString = search.toString();
  return queryString ? `/admin/corporate-enquiries?${queryString}` : "/admin/corporate-enquiries";
}

/** The link for a column heading: same column flips direction, else starts descending. */
export function sortHref(query: CorporateQuery, column: CorporateSortColumn): string {
  const direction =
    query.sort.column === column && query.sort.direction === "desc" ? "asc" : "desc";
  return corporateHref(query, { sort: { column, direction }, page: 1 });
}

/** `aria-sort` for a column heading. */
export function ariaSort(
  query: CorporateQuery,
  column: CorporateSortColumn,
): "ascending" | "descending" | "none" {
  if (query.sort.column !== column) return "none";
  return query.sort.direction === "asc" ? "ascending" : "descending";
}
