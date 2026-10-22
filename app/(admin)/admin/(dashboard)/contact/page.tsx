import type { Metadata } from "next";

import { AdminPaginationNav } from "@/components/admin/admin-pagination";
import { ContactEmpty } from "@/components/admin/contact-empty";
import { ContactFilters } from "@/components/admin/contact-filters";
import { ContactTable } from "@/components/admin/contact-table";
import { NotPermitted } from "@/components/admin/not-permitted";
import {
  contactHref,
  paginate,
  parseContactQuery,
  type RawSearchParams,
} from "@/lib/admin/contact-view";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import {
  CONTACT_PAGE_SIZE_DEFAULT,
  listContactSubmissions,
} from "@/lib/db/queries/contact-submissions";
import { getPublishedLocations } from "@/lib/db/queries/locations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminContactPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "contact_submissions")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const query = parseContactQuery(await searchParams);
  const [list, locations] = await Promise.all([
    listContactSubmissions(query.filters, query.sort, { page: query.page }),
    getPublishedLocations(),
  ]);

  const pages = paginate(list.total, list.page, CONTACT_PAGE_SIZE_DEFAULT);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-primary">Contact</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        General enquiries submitted through the site&rsquo;s contact form,
        newest first.
      </p>

      <section aria-labelledby="filters-heading" className="mt-8">
        <h2 id="filters-heading" className="sr-only">
          Filter submissions
        </h2>
        <ContactFilters
          query={query}
          locations={locations.map((location) => ({ id: location.id, name: location.name }))}
        />
      </section>

      <section aria-labelledby="queue-heading" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="queue-heading" className="text-lg font-medium text-primary">
            {list.total} {list.total === 1 ? "submission" : "submissions"}
          </h2>
          {list.total > 0 ? (
            <p className="text-sm text-muted-foreground">
              Showing {pages.from}–{pages.to} of {pages.total}
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          {list.rows.length === 0 ? (
            <ContactEmpty isFiltered={Object.keys(query.filters).length > 0} />
          ) : (
            <ContactTable rows={list.rows} query={query} />
          )}
        </div>

        <AdminPaginationNav
          pages={pages}
          hrefFor={(page) => contactHref(query, { page })}
          label="Contact pagination"
        />
      </section>
    </div>
  );
}
