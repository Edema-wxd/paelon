/**
 * Shown while the bookings queue resolves.
 *
 * This route is `force-dynamic` and runs three queries on every navigation —
 * including every filter change and every column sort — so unlike the marketing
 * routes this boundary is hit constantly, not just on a cold load. Without it a
 * sort click looks like a dead tap for the length of a database round trip.
 *
 * Deliberately not the marketing `RouteLoader`: that one centres itself in the
 * viewport and would throw the admin chrome away visually. This holds the
 * page's real shape — heading, filter card, table — so the layout does not jump
 * when the rows arrive (spec §13, CLS).
 */
export default function BookingsLoading() {
  return (
    <div className="mx-auto max-w-6xl" role="status" aria-live="polite">
      <span className="sr-only">Loading bookings</span>

      {/* Everything below stands in for content that is still loading and says
          nothing on its own, so it is hidden from assistive tech entirely —
          the live region above carries the state. */}
      <div aria-hidden className="animate-pulse">
        <div className="h-8 w-40 rounded-md bg-secondary" />
        <div className="mt-3 h-4 w-96 max-w-full rounded-full bg-secondary" />

        <div className="mt-8 rounded-xl border border-border bg-white p-4">
          <div className="h-4 w-16 rounded-full bg-secondary" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-10 rounded-md bg-secondary" />
            ))}
          </div>
        </div>

        <div className="mt-8 h-6 w-32 rounded-full bg-secondary" />
        <div className="mt-4 space-y-px overflow-hidden rounded-xl border border-border bg-white">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 p-3">
              <div className="h-4 w-28 rounded-full bg-secondary" />
              <div className="h-4 w-24 rounded-full bg-secondary" />
              <div className="h-5 w-20 rounded-full bg-secondary" />
              <div className="h-4 w-24 rounded-full bg-secondary" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
