import type { Metadata } from "next";

import { AdminPaginationNav } from "@/components/admin/admin-pagination";
import { CorporateEmpty } from "@/components/admin/corporate-empty";
import { CorporateFilters } from "@/components/admin/corporate-filters";
import { CorporateTable } from "@/components/admin/corporate-table";
import { NotPermitted } from "@/components/admin/not-permitted";
import {
  corporateHref,
  paginate,
  parseCorporateQuery,
  type RawSearchParams,
} from "@/lib/admin/corporate-view";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import {
  CORPORATE_PAGE_SIZE_DEFAULT,
  listCorporateEnquiries,
} from "@/lib/db/queries/corporate-enquiries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Corporate enquiries",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminCorporateEnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "corporate_enquiries")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const query = parseCorporateQuery(await searchParams);
  const list = await listCorporateEnquiries(query.filters, query.sort, { page: query.page });
  const pages = paginate(list.total, list.page, CORPORATE_PAGE_SIZE_DEFAULT);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-primary">Corporate enquiries</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Company enquiries submitted through the corporate enquiry form, newest
        first.
      </p>

      <section aria-labelledby="filters-heading" className="mt-8">
        <h2 id="filters-heading" className="sr-only">
          Filter enquiries
        </h2>
        <CorporateFilters query={query} />
      </section>

      <section aria-labelledby="queue-heading" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="queue-heading" className="text-lg font-medium text-primary">
            {list.total} {list.total === 1 ? "enquiry" : "enquiries"}
          </h2>
          {list.total > 0 ? (
            <p className="text-sm text-muted-foreground">
              Showing {pages.from}–{pages.to} of {pages.total}
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          {list.rows.length === 0 ? (
            <CorporateEmpty isFiltered={Object.keys(query.filters).length > 0} />
          ) : (
            <CorporateTable rows={list.rows} query={query} />
          )}
        </div>

        <AdminPaginationNav
          pages={pages}
          hrefFor={(page) => corporateHref(query, { page })}
          label="Corporate enquiries pagination"
        />
      </section>
    </div>
  );
}
