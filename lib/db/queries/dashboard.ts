import { and, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";

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
        unassigned: sql<number>`count(*) filter (where ${isNull(bookings.assignedToUserId)})::int`,
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

/** Corporate enquiries not yet resolved (`won` or `lost`), for the overview's quick-stats row. */
export async function getOpenCorporateEnquiryCount(): Promise<number> {
  const rows = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(corporateEnquiries)
    .where(and(ne(corporateEnquiries.status, "won"), ne(corporateEnquiries.status, "lost")));

  return rows[0]?.count ?? 0;
}
