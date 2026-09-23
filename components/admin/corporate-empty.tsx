import Link from "next/link";

/**
 * The corporate enquiries queue with nothing in it. Mirrors
 * `bookings-empty.tsx` and `contact-empty.tsx`.
 */
export function CorporateEmpty({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-white px-6 py-12 text-center">
      {isFiltered ? (
        <>
          <p className="text-base font-medium text-primary">
            No enquiries match these filters
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Try widening the date range, or clear the filters to see the whole
            pipeline.
          </p>
          <p className="mt-6 text-sm">
            <Link
              href="/admin/corporate-enquiries"
              className="text-accent underline underline-offset-4 hover:no-underline"
            >
              Clear filters
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="text-base font-medium text-primary">No enquiries yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Corporate enquiries land here the moment a company submits the
            {/* /for-corporates is still unbuilt (CLAUDE.md live gaps), so this
                does not link to it yet — that would be an invented, possibly
                dead, destination. */}
            {" "}enquiry form. Nothing is waiting on you right now.
          </p>
        </>
      )}
    </div>
  );
}
