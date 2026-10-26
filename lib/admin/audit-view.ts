import { isPiiKey } from "@/lib/admin/pii-keys";
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
 * Values are free of personal data with one deliberate exception — `writeAudit`
 * strips keys that name any, and `testimonials.quote` is recorded verbatim on
 * purpose (D4; see `lib/admin/audit.ts`). `/admin/audit` is `admin`-only, which
 * is the same bar as reading the testimonial itself.
 *
 * Keys the write path would strip today are hidden here too. Rows written
 * before a key joined the list still hold it — `contact.viewed` recorded the
 * patient's subject line until 2026-10-26 — and the log is evidence, so the
 * viewer stops showing it rather than anything rewriting the rows.
 *
 * Arrays are joined and anything else is JSON, so an unexpected shape shows
 * rather than throwing.
 */
export function metadataPairs(
  metadata: Record<string, unknown>,
): { key: string; value: string }[] {
  return Object.entries(metadata)
    .filter(([key]) => !isPiiKey(key))
    .map(([key, value]) => ({
      key: key.replace(/_/g, " "),
      value: Array.isArray(value)
        ? value.map((entry) => String(entry)).join(", ")
        : value === null || value === undefined
          ? "—"
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value),
    }));
}

/* -------------------------------------------------------------------------- */
/* Readable names                                                             */
/* -------------------------------------------------------------------------- */

/** What each `entity_type` is called, and where its row can be opened. */
const ENTITIES: Record<string, { label: string; href?: (id: string) => string }> = {
  bookings: { label: "Booking", href: (id) => `/admin/bookings/${id}` },
  contact_submissions: { label: "Contact message", href: (id) => `/admin/contact/${id}` },
  corporate_enquiries: { label: "Corporate enquiry", href: (id) => `/admin/corporate-enquiries/${id}` },
  users: { label: "Staff account", href: () => "/admin/users" },
  services: { label: "Service", href: (id) => `/admin/services/${id}` },
  doctors: { label: "Doctor", href: (id) => `/admin/doctors/${id}` },
  locations: { label: "Branch", href: (id) => `/admin/locations/${id}` },
  hmos: { label: "HMO", href: (id) => `/admin/hmos/${id}` },
  testimonials: { label: "Testimonial", href: (id) => `/admin/testimonials/${id}` },
  awards: { label: "Award", href: (id) => `/admin/awards/${id}` },
  faqs: { label: "FAQ", href: (id) => `/admin/faqs/${id}` },
  authors: { label: "Author", href: (id) => `/admin/authors/${id}` },
  blog_posts: { label: "Post", href: (id) => `/admin/blog/${id}` },
  about_content: { label: "About page", href: () => "/admin/about" },
  media: { label: "Media file", href: () => "/admin/media" },
  site_settings: { label: "Settings", href: () => "/admin/settings" },
};

/** The subject half of an event name (`blog.updated` → "Post"). */
const EVENT_NOUNS: Record<string, string> = {
  auth: "Sign-in",
  booking: "Booking",
  contact: "Contact message",
  corporate: "Corporate enquiry",
  user: "Staff account",
  media: "Media file",
  services: "Service",
  doctors: "Doctor",
  locations: "Branch",
  hmos: "HMO",
  testimonials: "Testimonial",
  awards: "Award",
  faqs: "FAQ",
  authors: "Author",
  blog: "Post",
  about_content: "About page",
  site_settings: "Settings",
};

/** The verb half (`blog.updated` → "edited"). Unknown verbs fall back to words. */
const EVENT_VERBS: Record<string, string> = {
  created: "created",
  updated: "edited",
  deleted: "deleted",
  viewed: "opened",
  status_changed: "status changed",
  bulk_status_changed: "status changed in bulk",
  assigned: "assigned",
  bulk_assigned: "assigned in bulk",
  notes_updated: "notes edited",
  handled_changed: "marked handled or open",
  anonymised: "personal data erased",
  layout_saved: "page layout saved",
  alt_updated: "alt text edited",
  logo_attached: "logo attached",
  unpublished: "unpublished",
  legacy_prose_cleared: "old page text cleared",
};

const SIGN_IN: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.login_failed": "Sign-in failed",
  "auth.login_blocked": "Sign-in blocked",
};

/**
 * An event code in words: `blog.updated` → "Post edited".
 *
 * The code stays the stored value and the filter value; this is display only.
 * An event this table does not know is still readable — underscores become
 * spaces — so a new event never renders blank.
 */
export function eventLabel(action: string): string {
  const signIn = SIGN_IN[action];
  if (signIn) return signIn;

  const dot = action.indexOf(".");
  if (dot === -1) return action.replace(/_/g, " ");
  const noun = action.slice(0, dot);
  const verb = action.slice(dot + 1);
  const nounLabel = EVENT_NOUNS[noun] ?? noun.replace(/_/g, " ");
  const verbLabel = EVENT_VERBS[verb] ?? verb.replace(/[._]/g, " ");
  return `${nounLabel} ${verbLabel}`;
}

/** An `entity_type` in words: `blog_posts` → "Post". */
export function entityLabel(entityType: string): string {
  return ENTITIES[entityType]?.label ?? entityType.replace(/_/g, " ");
}

/**
 * Where the row an entry is about can be opened, or null.
 *
 * Null after a delete, where the editor would 404 — a soft-deleted row is
 * reachable only from the database, which is where the delete message says it
 * can be restored.
 */
export function entityHref(
  entityType: string,
  entityId: string | null,
  action: string,
): string | null {
  if (!entityId || action.endsWith(".deleted")) return null;
  return ENTITIES[entityType]?.href?.(entityId) ?? null;
}
