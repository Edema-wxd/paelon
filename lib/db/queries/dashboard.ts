import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db/client";
import {
  bookings,
  contactSubmissions,
  corporateEnquiries,
  locations,
  type BookingStatus,
} from "@/lib/db/schema";

/**
 * Aggregate reads for the `/admin` overview (spec §8 dashboard).
 *
 * Each export is one round trip, called in parallel via `Promise.all` from the
 * page — never nested, never awaited in sequence. Every row projection avoids
 * the free-text, patient-authored columns (`reasonForVisit`, `message`,
 * `requirements`), matching the list queries in this directory.
 */

export const RECENT_BOOKINGS_LIMIT = 10;
export const RECENT_CONTACT_LIMIT = 5;

export interface RecentBooking {
  id: string;
  reference: string;
  status: BookingStatus;
  patientName: string | null;
  locationName: string;
  createdAt: Date;
}

/** The 10 newest bookings, for the overview's recent-activity block. */
export async function listRecentBookings(): Promise<RecentBooking[]> {
  return db()
    .select({
      id: bookings.id,
      reference: bookings.reference,
      status: bookings.status,
      patientName: bookings.patientName,
      locationName: locations.name,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .innerJoin(locations, eq(locations.id, bookings.locationId))
    .orderBy(desc(bookings.createdAt), desc(bookings.id))
    .limit(RECENT_BOOKINGS_LIMIT);
}

export interface RecentContactSubmission {
  id: string;
  subject: string;
  name: string | null;
  handled: boolean;
  createdAt: Date;
}

/** The 5 newest contact submissions, for the overview's recent-activity block. */
export async function listRecentContactSubmissions(): Promise<RecentContactSubmission[]> {
  return db()
    .select({
      id: contactSubmissions.id,
      subject: contactSubmissions.subject,
      name: contactSubmissions.name,
      handled: contactSubmissions.handled,
      createdAt: contactSubmissions.createdAt,
    })
    .from(contactSubmissions)
    .orderBy(desc(contactSubmissions.createdAt), desc(contactSubmissions.id))
    .limit(RECENT_CONTACT_LIMIT);
}

export interface BookingQuickStats {
  byStatus: Record<BookingStatus, number>;
  newLast7Days: number;
  /** Unassigned and still open (`new` or `contacted`) — closed bookings need no owner. */
  unassigned: number;
}

/**
 * Booking counts for the overview's quick-stats row: one grouped count, plus
 * two single predicates, in one round trip via `FILTER`.
 */
export async function getBookingQuickStats(): Promise<BookingQuickStats> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [statusRows, extra] = await Promise.all([
    db()
      .select({ status: bookings.status, count: sql<number>`count(*)::int` })
      .from(bookings)
      .groupBy(bookings.status),
    db()
      .select({
        newLast7Days: sql<number>`count(*) filter (where ${gte(bookings.createdAt, sevenDaysAgo)})::int`,
        unassigned: sql<number>`count(*) filter (where ${and(
          isNull(bookings.assignedToUserId),
          inArray(bookings.status, OPEN_BOOKING_STATUSES),
        )})::int`,
      })
      .from(bookings),
  ]);

  const byStatus = Object.fromEntries(
    statusRows.map((row) => [row.status, row.count]),
  ) as Record<BookingStatus, number>;

  return {
    byStatus,
    newLast7Days: extra[0]?.newLast7Days ?? 0,
    unassigned: extra[0]?.unassigned ?? 0,
  };
}

/** Bookings someone still has to act on. Shared with the overview's links. */
export const OPEN_BOOKING_STATUSES: BookingStatus[] = ["new", "contacted"];

/** Corporate statuses short of `won` or `lost`. */
export const OPEN_CORPORATE_STATUSES = ["new", "contacted", "proposal_sent"] as const;

export interface InboxCounts {
  newBookings: number | null;
  openContact: number | null;
  openCorporate: number | null;
}

/**
 * What is waiting in each patient-facing queue, for the sidebar badges and the
 * overview's "Needs attention" row.
 *
 * Each flag says whether the caller may read that queue; a queue it may not
 * read comes back `null` and is never queried, so a role without access to
 * bookings cannot learn even that the count is zero.
 *
 * Wrapped in `cache()` because the admin layout and the overview page both
 * ask for it in the same request — one round trip, not two.
 */
export const getInboxCounts = cache(
  async (
    bookingsAllowed: boolean,
    contactAllowed: boolean,
    corporateAllowed: boolean,
  ): Promise<InboxCounts> => {
    const count = sql<number>`count(*)::int`;
    const [b, c, k] = await Promise.all([
      bookingsAllowed
        ? db().select({ n: count }).from(bookings).where(eq(bookings.status, "new"))
        : null,
      contactAllowed
        ? db()
            .select({ n: count })
            .from(contactSubmissions)
            .where(eq(contactSubmissions.handled, false))
        : null,
      corporateAllowed
        ? db()
            .select({ n: count })
            .from(corporateEnquiries)
            .where(inArray(corporateEnquiries.status, [...OPEN_CORPORATE_STATUSES]))
        : null,
    ]);

    return {
      newBookings: b ? (b[0]?.n ?? 0) : null,
      openContact: c ? (c[0]?.n ?? 0) : null,
      openCorporate: k ? (k[0]?.n ?? 0) : null,
    };
  },
);
