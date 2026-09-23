import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  corporateEnquiries,
  type CompanySize,
  type CorporateEnquiry,
  type CorporateStatus,
} from "@/lib/db/schema";

/**
 * Admin reads and writes for `/admin/corporate-enquiries` (spec §8).
 *
 * `requirements` never appears in a list projection — it is patient-adjacent
 * free text a company wrote about its needs, so every admin read names its
 * columns rather than `select()`ing the whole row, mirroring
 * `lib/db/queries/bookings.ts` and `lib/db/queries/contact-submissions.ts`.
 *
 * Never cached: corporate enquiries are personal data (the contact person's
 * details) and mutable.
 */

export const CORPORATE_PAGE_SIZE_DEFAULT = 25;
export const CORPORATE_PAGE_SIZE_MAX = 100;

export interface CorporateListFilters {
  statuses?: CorporateStatus[];
  companySize?: CompanySize;
  /** Inclusive, `YYYY-MM-DD`, against `createdAt`. */
  createdFrom?: string;
  /** Inclusive, `YYYY-MM-DD`, against `createdAt`. */
  createdTo?: string;
}

export type CorporateSortColumn = "createdAt" | "companyName" | "status";

export interface CorporateListSort {
  column: CorporateSortColumn;
  direction: "asc" | "desc";
}

export interface CorporateListPage {
  page: number;
  pageSize?: number;
}

/** One row of the corporate enquiries queue. No `requirements`, no contact email/phone. */
export interface CorporateListRow {
  id: string;
  companyName: string;
  contactName: string | null;
  status: CorporateStatus;
  companySize: CompanySize;
  createdAt: Date;
  anonymisedAt: Date | null;
}

export interface CorporateList {
  rows: CorporateListRow[];
  total: number;
  page: number;
  pageSize: number;
}

const SORT_COLUMNS = {
  createdAt: corporateEnquiries.createdAt,
  companyName: corporateEnquiries.companyName,
  status: corporateEnquiries.status,
} as const;

function listConditions(filters: CorporateListFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(inArray(corporateEnquiries.status, filters.statuses));
  }
  if (filters.companySize) {
    conditions.push(eq(corporateEnquiries.companySize, filters.companySize));
  }
  if (filters.createdFrom) {
    conditions.push(
      gte(corporateEnquiries.createdAt, new Date(`${filters.createdFrom}T00:00:00Z`)),
    );
  }
  if (filters.createdTo) {
    conditions.push(
      lte(corporateEnquiries.createdAt, new Date(`${filters.createdTo}T23:59:59.999Z`)),
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/** A filtered, sorted page of corporate enquiries, with the total matching count. */
export async function listCorporateEnquiries(
  filters: CorporateListFilters = {},
  sort: CorporateListSort = { column: "createdAt", direction: "desc" },
  page: CorporateListPage = { page: 1 },
): Promise<CorporateList> {
  const pageNumber = Math.max(1, Math.floor(page.page));
  const pageSize = Math.min(
    CORPORATE_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(page.pageSize ?? CORPORATE_PAGE_SIZE_DEFAULT)),
  );
  const where = listConditions(filters);
  const order = sort.direction === "desc" ? desc : asc;

  const [rows, counts] = await Promise.all([
    db()
      .select({
        id: corporateEnquiries.id,
        companyName: corporateEnquiries.companyName,
        contactName: corporateEnquiries.contactName,
        status: corporateEnquiries.status,
        companySize: corporateEnquiries.companySize,
        createdAt: corporateEnquiries.createdAt,
        anonymisedAt: corporateEnquiries.anonymisedAt,
      })
      .from(corporateEnquiries)
      .where(where)
      .orderBy(order(SORT_COLUMNS[sort.column]), order(corporateEnquiries.id))
      .limit(pageSize)
      .offset((pageNumber - 1) * pageSize),
    db()
      .select({ count: sql<number>`count(*)::int` })
      .from(corporateEnquiries)
      .where(where),
  ]);

  return { rows, total: counts[0]?.count ?? 0, page: pageNumber, pageSize };
}

/**
 * One corporate enquiry for the detail view. Includes `requirements` and
 * contact details — only `editor` and `admin` can read this resource at all,
 * which is who §8 lets see them. Render it and nothing else.
 */
export async function getCorporateEnquiryForAdmin(
  id: string,
): Promise<CorporateEnquiry | null> {
  const rows = await db()
    .select()
    .from(corporateEnquiries)
    .where(eq(corporateEnquiries.id, id))
    .limit(1);

  return rows[0] ?? null;
}

export type ChangeCorporateStatusResult =
  | { ok: true; from: CorporateStatus; to: CorporateStatus }
  | { ok: false; reason: "not_found" };

/**
 * Move a corporate enquiry to `to`.
 *
 * No transition graph, unlike bookings: a sales pipeline moves in whatever
 * order the actual conversation with the company went — a "won" deal can slip
 * back to "contacted" pending a fresh procurement cycle, and there is no
 * regulated workflow (like a patient appointment's) that a wrong move could
 * violate. Any status may move to any other; the enum itself is the only
 * validation, enforced by the Zod schema in the action layer.
 */
export async function changeCorporateStatus(
  id: string,
  to: CorporateStatus,
): Promise<ChangeCorporateStatusResult> {
  const current = await db()
    .select({ status: corporateEnquiries.status })
    .from(corporateEnquiries)
    .where(eq(corporateEnquiries.id, id))
    .limit(1);
  const from = current[0]?.status;
  if (!from) return { ok: false, reason: "not_found" };

  await db()
    .update(corporateEnquiries)
    .set({ status: to })
    .where(eq(corporateEnquiries.id, id));

  return { ok: true, from, to };
}

export type AnonymiseCorporateResult = { ok: true } | { ok: false; reason: "not_found" };

/**
 * Erase a corporate enquiry's personal data under the retention policy.
 *
 * `companyName`, `companySize`, `sector`, `status` and the timestamps survive:
 * they are business facts about a company, not personal data about the
 * individual who submitted the enquiry — the same reasoning `bookings` uses to
 * keep `locationId`/`status` after anonymisation. `contactName`, `contactEmail`
 * and `contactPhone` are the personal data and are nulled. `requirements`
 * (which routinely names the contact and their role) is `NOT NULL` in the
 * schema, so it is cleared to `""` rather than `null` — an empty string reads
 * the same as "erased" everywhere this is rendered.
 */
export async function anonymiseCorporateEnquiry(
  id: string,
): Promise<AnonymiseCorporateResult> {
  const updated = await db()
    .update(corporateEnquiries)
    .set({
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      requirements: "",
      anonymisedAt: new Date(),
    })
    .where(eq(corporateEnquiries.id, id))
    .returning({ id: corporateEnquiries.id });

  return updated.length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}
