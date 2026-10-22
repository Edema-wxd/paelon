import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  contactSubmissions,
  locations,
  users,
  type ContactSubmission,
} from "@/lib/db/schema";

/**
 * Admin reads and writes for `/admin/contact` (spec §8).
 *
 * `message` never appears in a list projection — it is the one field that
 * turns a triage row into patient-submitted free text, so every admin read
 * names its columns rather than `select()`ing the whole row, exactly as
 * `lib/db/queries/bookings.ts` does for `reason_for_visit`.
 *
 * Never cached: contact submissions are personal data and mutable.
 */

export const CONTACT_PAGE_SIZE_DEFAULT = 25;
export const CONTACT_PAGE_SIZE_MAX = 100;

export interface ContactListFilters {
  handled?: boolean;
  locationId?: string;
  /** Inclusive, `YYYY-MM-DD`, against `createdAt`. */
  createdFrom?: string;
  /** Inclusive, `YYYY-MM-DD`, against `createdAt`. */
  createdTo?: string;
}

export type ContactSortColumn = "createdAt" | "subject" | "handled";

export interface ContactListSort {
  column: ContactSortColumn;
  direction: "asc" | "desc";
}

export interface ContactListPage {
  page: number;
  pageSize?: number;
}

/** One row of the contact queue. No `message`. */
export interface ContactListRow {
  id: string;
  subject: string;
  name: string | null;
  handled: boolean;
  createdAt: Date;
  locationId: string | null;
  locationName: string | null;
  anonymisedAt: Date | null;
}

export interface ContactList {
  rows: ContactListRow[];
  total: number;
  page: number;
  pageSize: number;
}

const SORT_COLUMNS = {
  createdAt: contactSubmissions.createdAt,
  subject: contactSubmissions.subject,
  handled: contactSubmissions.handled,
} as const;

function listConditions(filters: ContactListFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.handled !== undefined) {
    conditions.push(eq(contactSubmissions.handled, filters.handled));
  }
  if (filters.locationId) {
    conditions.push(eq(contactSubmissions.locationId, filters.locationId));
  }
  if (filters.createdFrom) {
    conditions.push(gte(contactSubmissions.createdAt, new Date(`${filters.createdFrom}T00:00:00Z`)));
  }
  if (filters.createdTo) {
    conditions.push(lte(contactSubmissions.createdAt, new Date(`${filters.createdTo}T23:59:59.999Z`)));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/** A filtered, sorted page of contact submissions, with the total matching count. */
export async function listContactSubmissions(
  filters: ContactListFilters = {},
  sort: ContactListSort = { column: "createdAt", direction: "desc" },
  page: ContactListPage = { page: 1 },
): Promise<ContactList> {
  const pageNumber = Math.max(1, Math.floor(page.page));
  const pageSize = Math.min(
    CONTACT_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(page.pageSize ?? CONTACT_PAGE_SIZE_DEFAULT)),
  );
  const where = listConditions(filters);
  const order = sort.direction === "desc" ? desc : asc;

  const [rows, counts] = await Promise.all([
    db()
      .select({
        id: contactSubmissions.id,
        subject: contactSubmissions.subject,
        name: contactSubmissions.name,
        handled: contactSubmissions.handled,
        createdAt: contactSubmissions.createdAt,
        locationId: contactSubmissions.locationId,
        locationName: locations.name,
        anonymisedAt: contactSubmissions.anonymisedAt,
      })
      .from(contactSubmissions)
      .leftJoin(locations, eq(locations.id, contactSubmissions.locationId))
      .where(where)
      .orderBy(order(SORT_COLUMNS[sort.column]), order(contactSubmissions.id))
      .limit(pageSize)
      .offset((pageNumber - 1) * pageSize),
    db()
      .select({ count: sql<number>`count(*)::int` })
      .from(contactSubmissions)
      .where(where),
  ]);

  return { rows, total: counts[0]?.count ?? 0, page: pageNumber, pageSize };
}

export interface AdminContactDetail {
  submission: ContactSubmission;
  locationName: string | null;
  handledByName: string | null;
}

/**
 * One contact submission for the detail view. Includes `message` — only
 * `editor` and `admin` can read this resource at all (`can()`), which is who
 * §8 lets see it. Render it and nothing else: never a log line, never audit
 * metadata.
 */
export async function getContactSubmissionForAdmin(
  id: string,
): Promise<AdminContactDetail | null> {
  const found = await db()
    .select({
      submission: contactSubmissions,
      locationName: locations.name,
      handledByName: users.name,
    })
    .from(contactSubmissions)
    .leftJoin(locations, eq(locations.id, contactSubmissions.locationId))
    .leftJoin(users, eq(users.id, contactSubmissions.handledBy))
    .where(eq(contactSubmissions.id, id))
    .limit(1);

  return found[0] ?? null;
}

export type MarkHandledResult = { ok: true } | { ok: false; reason: "not_found" };

/**
 * Mark a submission handled or unhandled. Unmarking clears `handledBy` and
 * `handledAt` rather than leaving a stale actor/time on a row that is, as of
 * this write, unhandled again.
 */
export async function markHandled(
  id: string,
  userId: string,
  handled: boolean,
): Promise<MarkHandledResult> {
  const updated = await db()
    .update(contactSubmissions)
    .set({
      handled,
      handledBy: handled ? userId : null,
      handledAt: handled ? new Date() : null,
    })
    .where(eq(contactSubmissions.id, id))
    .returning({ id: contactSubmissions.id });

  return updated.length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}

export type AnonymiseContactResult = { ok: true } | { ok: false; reason: "not_found" };

/**
 * Erase a contact submission's personal data under the retention policy.
 *
 * `subject`, `locationId`, `handled` and the timestamps survive: `subject` is
 * a short category ("Billing question"), not identifying on its own, and the
 * rest are operational facts about how the enquiry was triaged, not personal
 * data about the person who sent it — the same reasoning `bookings` uses to
 * keep `locationId`/`status` after anonymisation.
 */
export async function anonymiseContactSubmission(
  id: string,
): Promise<AnonymiseContactResult> {
  const updated = await db()
    .update(contactSubmissions)
    .set({
      name: null,
      email: null,
      phone: null,
      message: null,
      anonymisedAt: new Date(),
    })
    .where(eq(contactSubmissions.id, id))
    .returning({ id: contactSubmissions.id });

  return updated.length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}
