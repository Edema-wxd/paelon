/**
 * Generic pagination for admin list views (`/admin/bookings`, `/admin/contact`,
 * `/admin/corporate-enquiries`, …).
 *
 * Pulled out of `lib/admin/booking-view.ts` once a second and third resource
 * needed the same "page numbers for the showing X–Y of Z line" arithmetic.
 * Pure and DB-free, so it is unit-tested without a database and safe to import
 * from a client component.
 */

export interface AdminPagination {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  from: number;
  to: number;
}

/** Page numbers for the "showing 26–50 of 120" line and the prev/next links. */
export function paginate(
  total: number,
  page: number,
  pageSize: number,
): AdminPagination {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  return {
    page: current,
    pageSize,
    total,
    pages,
    from,
    to: Math.min(total, current * pageSize),
  };
}
