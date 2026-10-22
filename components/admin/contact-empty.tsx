import Link from "next/link";

/**
 * The contact queue with nothing in it. Mirrors `bookings-empty.tsx` — see
 * that component's comment for why a filtered-empty and a genuinely-empty
 * queue need different copy.
 */
export function ContactEmpty({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-white px-6 py-12 text-center">
      {isFiltered ? (
        <>
          <p className="text-base font-medium text-primary">
            No submissions match these filters
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Try widening the date range, or clear the filters to see the whole
            queue.
          </p>
          <p className="mt-6 text-sm">
            <Link
              href="/admin/contact"
              className="text-accent underline underline-offset-4 hover:no-underline"
            >
              Clear filters
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="text-base font-medium text-primary">No submissions yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Contact form enquiries land here the moment a visitor submits it.
            Nothing is waiting on you right now.
          </p>
          <p className="mt-6 text-sm">
            <Link
              href="/contact"
              className="text-accent underline underline-offset-4 hover:no-underline"
            >
              Open the contact form
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
