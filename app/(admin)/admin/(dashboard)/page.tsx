import Link from "next/link";
import type { Metadata } from "next";

import { BOOKING_STATUS_LABELS } from "@/lib/admin/booking-view";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import {
  getBookingQuickStats,
  getOpenCorporateEnquiryCount,
  listRecentBookings,
  listRecentContactSubmissions,
} from "@/lib/db/queries/dashboard";
import type { BookingStatus } from "@/lib/db/schema";

/**
 * Admin overview (spec §8 dashboard).
 *
 * Recent bookings, recent contact submissions and quick stats, each gated on
 * `can()` for its own resource so a role that cannot read bookings never sees
 * a booking count, patient name or reference — not even a zero. Every block
 * runs its own query; all of them fire together via `Promise.all` rather than
 * one after another, and none is cached (booking and contact data are
 * personal and mutable, per the query modules they call into).
 */

export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false, nocache: true },
};

const BOOKING_STATUS_ORDER: BookingStatus[] = [
  "new",
  "contacted",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
];

export default async function AdminOverviewPage() {
  const user = await requireAdminUser();

  const canReadBookings = can(user.role, "read", "bookings");
  const canReadContact = can(user.role, "read", "contact_submissions");
  const canReadCorporate = can(user.role, "read", "corporate_enquiries");

  const [recentBookings, bookingStats, recentContact, openCorporateCount] = await Promise.all([
    canReadBookings ? listRecentBookings() : Promise.resolve(null),
    canReadBookings ? getBookingQuickStats() : Promise.resolve(null),
    canReadContact ? listRecentContactSubmissions() : Promise.resolve(null),
    canReadCorporate ? getOpenCorporateEnquiryCount() : Promise.resolve(null),
  ]);

  const showStats = bookingStats !== null || openCorporateCount !== null;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-primary">
        Signed in as {user.name || user.email}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your role is <strong className="text-primary">{user.roleLabel}</strong>.
      </p>

      {showStats ? (
        <section aria-labelledby="quick-stats-heading" className="mt-8">
          <h2 id="quick-stats-heading" className="text-lg font-medium text-primary">
            Quick stats
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {bookingStats
              ? BOOKING_STATUS_ORDER.map((status) => (
                  <Stat
                    key={status}
                    label={`Bookings: ${BOOKING_STATUS_LABELS[status]}`}
                    value={bookingStats.byStatus[status] ?? 0}
                  />
                ))
              : null}
            {bookingStats ? (
              <>
                <Stat label="New bookings, last 7 days" value={bookingStats.newLast7Days} />
                <Stat label="Unassigned bookings" value={bookingStats.unassigned} />
              </>
            ) : null}
            {openCorporateCount !== null ? (
              <Stat label="Open corporate enquiries" value={openCorporateCount} />
            ) : null}
          </dl>
        </section>
      ) : null}

      {recentBookings ? (
        <section aria-labelledby="recent-bookings-heading" className="mt-8">
          <h2 id="recent-bookings-heading" className="text-lg font-medium text-primary">
            Recent bookings
          </h2>
          {recentBookings.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {recentBookings.map((booking) => (
                <li
                  key={booking.id}
                  className="rounded-md bg-white px-4 py-3 text-sm"
                >
                  <Link
                    href={`/admin/bookings/${booking.id}`}
                    className="font-medium text-accent underline underline-offset-4 hover:no-underline"
                  >
                    {booking.reference}
                  </Link>
                  <span className="ml-2 text-primary">
                    {booking.patientName ?? "Unnamed patient"} · {booking.locationName}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {BOOKING_STATUS_LABELS[booking.status]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No bookings yet.</p>
          )}
        </section>
      ) : null}

      {recentContact ? (
        <section aria-labelledby="recent-contact-heading" className="mt-8">
          <h2 id="recent-contact-heading" className="text-lg font-medium text-primary">
            Recent contact submissions
          </h2>
          {recentContact.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {recentContact.map((submission) => (
                <li
                  key={submission.id}
                  className="rounded-md bg-white px-4 py-3 text-sm"
                >
                  <Link
                    href={`/admin/contact/${submission.id}`}
                    className="font-medium text-accent underline underline-offset-4 hover:no-underline"
                  >
                    {submission.subject}
                  </Link>
                  <span className="ml-2 text-primary">
                    {submission.name ?? "Anonymous"}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {submission.handled ? "Handled" : "Open"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No contact submissions yet.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-white px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-primary">{value}</dd>
    </div>
  );
}
