import Link from "next/link";

import { AdminPaginationNav } from "@/components/admin/admin-pagination";
import { NotPermitted } from "@/components/admin/not-permitted";
import { ResourceEmpty } from "@/components/admin/resource-empty";
import { ResourceFilters } from "@/components/admin/resource-filters";
import { ResourceTable } from "@/components/admin/resource-table";
import { Button } from "@/components/ui/button";
import type { ResourceConfig } from "@/lib/admin/resource-config";
import {
  paginate,
  parseResourceQuery,
  resourceListHref,
  type RawSearchParams,
} from "@/lib/admin/resource-view";
import { RESOURCE_SERVER } from "@/lib/admin/resources/server";
import type { ResourceName } from "@/lib/admin/resources";
import { can, canOnRow } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import {
  CONTENT_PAGE_SIZE_DEFAULT,
  listContent,
  type ContentRow,
} from "@/lib/db/queries/content-crud";

/**
 * The whole list screen for a content type, so a route file is a title, a
 * config and this.
 *
 * A server component: the permission check, the query and the rows all happen
 * before anything is sent, and the only client JavaScript on the page is the
 * delete confirmation on a row's detail view.
 *
 * ## The contributor case
 *
 * A `contributor` may update only rows they created (spec §8 Roles), so the
 * list defaults to their own rows — a list mostly full of rows whose edit
 * screen refuses them is a worse experience than a shorter list. The "only the
 * ones I created" toggle lets them see the rest, which they may still read.
 */
export async function ResourceListScreen<R extends ContentRow>({
  resource,
  config,
  searchParams,
}: {
  resource: ResourceName;
  config: ResourceConfig<R>;
  searchParams: RawSearchParams;
}) {
  const user = await requireAdminUser();
  const server = RESOURCE_SERVER[resource];

  if (!can(user.role, "read", server.permission)) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const canCreate = can(user.role, "create", server.permission);
  // Ownership-scoped update: `can` allows it for some rows, but `canOnRow`
  // against an unowned row refuses — which is the policy's own definition of
  // "own rows only", rather than a guess from the role name.
  const ownRowsOnly =
    can(user.role, "update", server.permission) &&
    !canOnRow(user, "update", server.permission, {});

  const query = parseResourceQuery(config, searchParams);
  const sortColumn = server.table[
    query.sort.key as keyof typeof server.table
  ] as (typeof server.table)["id"] | undefined;

  const list = await listContent<R>(server.table, {
    page: query.page,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { search: query.search } : {}),
    searchColumns: [
      server.table[config.titleField as keyof typeof server.table] as never,
    ],
    ...(sortColumn ? { sort: { column: sortColumn, direction: query.sort.direction } } : {}),
    ...(query.mine ? { createdByUserId: user.id } : {}),
  });

  const pages = paginate(list.total, list.page, CONTENT_PAGE_SIZE_DEFAULT);
  const isFiltered =
    query.status !== undefined || query.search !== undefined || query.mine;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">{config.plural}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {config.description}
          </p>
        </div>

        {canCreate ? (
          <Button asChild>
            <Link href={`/admin/${config.name}/new`}>
              New {config.singular.toLowerCase()}
            </Link>
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="filters-heading" className="mt-8">
        <h2 id="filters-heading" className="sr-only">
          Filter {config.plural.toLowerCase()}
        </h2>
        <ResourceFilters config={config} query={query} showMine={ownRowsOnly} />
      </section>

      <section aria-labelledby="list-heading" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="list-heading" className="text-lg font-medium text-primary">
            {list.total}{" "}
            {list.total === 1
              ? config.singular.toLowerCase()
              : config.plural.toLowerCase()}
          </h2>
          {list.total > 0 ? (
            <p className="text-sm text-muted-foreground">
              Showing {pages.from}–{pages.to} of {pages.total}
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          {list.rows.length === 0 ? (
            <ResourceEmpty
              config={config}
              isFiltered={isFiltered}
              canCreate={canCreate}
            />
          ) : (
            <ResourceTable config={config} rows={list.rows} query={query} />
          )}
        </div>

        <AdminPaginationNav
          pages={pages}
          hrefFor={(page) => resourceListHref(config.name, query, { page })}
          label={`${config.plural} pagination`}
        />
      </section>
    </div>
  );
}
