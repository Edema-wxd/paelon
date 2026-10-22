import Link from "next/link";

import type { AdminPagination } from "@/lib/admin/list-view";

/**
 * The "showing X–Y of Z" line and prev/next nav, shared by every admin list
 * view. Extracted from `/admin/bookings`'s page once contact and corporate
 * enquiries needed the identical block.
 *
 * A server component: the links are hrefs the caller builds from its own
 * query state (`bookingHref`, `contactHref`, …), so this component itself
 * never needs to know a resource's URL shape.
 */
export function AdminPaginationNav({
  pages,
  hrefFor,
  label,
}: {
  pages: AdminPagination;
  hrefFor: (page: number) => string;
  /** `aria-label` for the `<nav>`, e.g. "Bookings pagination". */
  label: string;
}) {
  if (pages.pages <= 1) return null;

  return (
    <nav
      aria-label={label}
      className="mt-6 flex items-center justify-between gap-4"
    >
      {pages.page > 1 ? (
        <Link
          href={hrefFor(pages.page - 1)}
          className="text-sm text-accent underline underline-offset-4 hover:no-underline"
        >
          Previous page
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted-foreground">
        Page {pages.page} of {pages.pages}
      </p>
      {pages.page < pages.pages ? (
        <Link
          href={hrefFor(pages.page + 1)}
          className="text-sm text-accent underline underline-offset-4 hover:no-underline"
        >
          Next page
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
