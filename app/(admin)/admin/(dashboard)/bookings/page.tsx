import type { Metadata } from "next";

import { AdminPaginationNav } from "@/components/admin/admin-pagination";
import { BookingFilters } from "@/components/admin/booking-filters";
import { BookingsEmpty } from "@/components/admin/bookings-empty";
import { BookingsTable } from "@/components/admin/bookings-table";
import { NotPermitted } from "@/components/admin/not-permitted";
import {
  bookingHref,
  paginate,
  parseBookingQuery,
  type RawSearchParams,
} from "@/lib/admin/booking-view";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import {
  listAssignableUsers,
  listBookings,
  BOOKING_PAGE_SIZE_DEFAULT,
} from "@/lib/db/queries/bookings";
import { getPublishedLocations } from "@/lib/db/queries/locations";

/**
 * The booking workflow queue (spec §8 Booking workflow).
 *
 * Filters, sort and page come from the URL, so this stays a server component
 * with no client state: see lib/admin/booking-view.ts. Only the selection
 * checkboxes and the bulk-action result are client-side.
 *
 * `force-dynamic` and no caching — patient submissions are never cached
 * (master spec §5), and a queue showing a booking someone else already handled
 * is how two people ring the same patient.
 *
 * Reading the queue is not audited: §8 logs the *opening of a detail page*, not
 * list views, so the audit log stays a record of who saw whose data.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bookings",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "bookings")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const query = parseBookingQuery(await searchParams);
  const [list, locations, assignees] = await Promise.all([
    listBookings(query.filters, query.sort, { page: query.page }),
    getPublishedLocations(),
    listAssignableUsers(),
  ]);

  const pages = paginate(list.total, list.page, BOOKING_PAGE_SIZE_DEFAULT);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-primary">Bookings</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Appointment requests, soonest requested date first. A request is not a
        reserved slot — the branch confirms the time by phone.
      </p>

      <section aria-labelledby="filters-heading" className="mt-8">
        <h2 id="filters-heading" className="sr-only">
          Filter bookings
        </h2>
        <BookingFilters
          query={query}
          locations={locations.map((location) => ({
            id: location.id,
            name: location.name,
          }))}
          assignees={assignees}
        />
      </section>

      <section aria-labelledby="queue-heading" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="queue-heading" className="text-lg font-medium text-primary">
            {list.total} {list.total === 1 ? "booking" : "bookings"}
          </h2>
          {list.total > 0 ? (
            <p className="text-sm text-muted-foreground">
              Showing {pages.from}–{pages.to} of {pages.total}
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          {list.rows.length === 0 ? (
            <BookingsEmpty isFiltered={Object.keys(query.filters).length > 0} />
          ) : (
            <BookingsTable
              rows={list.rows}
              query={query}
              canAct={can(user.role, "update", "bookings")}
            />
          )}
        </div>

        <AdminPaginationNav
          pages={pages}
          hrefFor={(page) => bookingHref(query, { page })}
          label="Bookings pagination"
        />
      </section>
    </div>
  );
}
