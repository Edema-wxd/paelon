import Link from "next/link";

/**
 * The bookings queue with nothing in it.
 *
 * Two different situations wear the same blank table, and telling someone the
 * wrong one wastes their time: a filter that matches nothing needs clearing,
 * while a genuinely empty queue means the work is done and the next move is
 * elsewhere. So the copy branches on `isFiltered` and each branch names one
 * concrete next step rather than stopping at "no results".
 *
 * A server component — no state, and it must render on a boundary where the
 * table's client bundle may not have arrived yet.
 */
export function BookingsEmpty({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-white px-6 py-12 text-center">
      {isFiltered ? (
        <>
          <p className="text-base font-medium text-primary">
            No bookings match these filters
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Try widening the preferred-date range, or clear the filters to see
            the whole queue.
          </p>
          <p className="mt-6 text-sm">
            <Link
              href="/admin/bookings"
              className="text-accent underline underline-offset-4 hover:no-underline"
            >
              Clear filters
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="text-base font-medium text-primary">
            No bookings yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Appointment requests land here the moment a patient submits the
            booking form. Nothing is waiting on you right now.
          </p>
          <p className="mt-6 text-sm">
            <Link
              href="/book"
              className="text-accent underline underline-offset-4 hover:no-underline"
            >
              Open the patient booking form
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
