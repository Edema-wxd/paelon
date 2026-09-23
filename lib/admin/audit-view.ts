import type { AuditFilters } from "@/lib/db/queries/audit";

/**
 * URL state for `/admin/audit`, parsed and rebuilt.
 *
 * Same approach as lib/admin/booking-view.ts: the view is a URL, nothing is
 * trusted, and it is pure so it can be tested without a database. The page
 * checks filter values against the facets the log actually contains, so this
 * only has to enforce shape.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface AuditQuery {
  filters: AuditFilters;
  page: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Event and entity names are dotted lowercase identifiers, e.g. `user.created`. */
const NAME = /^[a-z_]+(\.[a-z_]+)*$/;

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

function name(value: string | undefined): string | undefined {
  return value && value.length <= 64 && NAME.test(value) ? value : undefined;
}

/** Read the filters and page out of the URL, dropping anything malformed. */
export function parseAuditQuery(params: RawSearchParams): AuditQuery {
  const actor = first(params.actor);
  const page = Number.parseInt(first(params.page) ?? "1", 10);

  const filters: AuditFilters = {};
  const action = name(first(params.action));
  const entityType = name(first(params.entity));
  const from = isoDate(first(params.from));
  const to = isoDate(first(params.to));

  if (action) filters.action = action;
  if (entityType) filters.entityType = entityType;
  // "system" is the sign-in path's actor: a failed login has no user yet.
  if (actor === "system" || (actor && UUID.test(actor))) filters.actor = actor;
  if (from) filters.from = from;
  if (to) filters.to = to;

  return { filters, page: Number.isFinite(page) && page > 0 ? page : 1 };
}

/** The href for a view, with empty values left out. */
export function auditHref(query: AuditQuery, overrides: { page?: number } = {}): string {
  const page = overrides.page ?? query.page;
  const { filters } = query;
  const search = new URLSearchParams();

  if (filters.action) search.set("action", filters.action);
  if (filters.entityType) search.set("entity", filters.entityType);
  if (filters.actor) search.set("actor", filters.actor);
  if (filters.from) search.set("from", filters.from);
  if (filters.to) search.set("to", filters.to);
  if (page > 1) search.set("page", String(page));

  const queryString = search.toString();
  return queryString ? `/admin/audit?${queryString}` : "/admin/audit";
}

/** Is any filter applied? Decides whether "Clear filters" renders. */
export function isFiltered(query: AuditQuery): boolean {
  return Object.keys(query.filters).length > 0;
}

/**
 * Metadata as `key: value` pairs for display.
 *
 * Values are already free of personal data — `writeAudit` strips keys that name
 * any — so this only has to render them readably. Arrays are joined and
 * anything else is JSON, so an unexpected shape shows rather than throwing.
 */
export function metadataPairs(
  metadata: Record<string, unknown>,
): { key: string; value: string }[] {
  return Object.entries(metadata).map(([key, value]) => ({
    key,
    value: Array.isArray(value)
      ? value.map((entry) => String(entry)).join(", ")
      : value === null || value === undefined
        ? "—"
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value),
  }));
}
