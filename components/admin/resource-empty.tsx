import Link from "next/link";

import type { ResourceConfig } from "@/lib/admin/resource-config";

/**
 * A content list with nothing in it. Mirrors `bookings-empty.tsx` and its
 * siblings, but takes its copy from the resource config so one component covers
 * every type.
 *
 * The filtered and unfiltered cases are different messages on purpose: "no
 * results" and "nothing exists yet" call for different next actions, and
 * showing "create the first one" to someone whose filter simply excluded
 * everything is how duplicates get made.
 */
export function ResourceEmpty<R>({
  config,
  isFiltered,
  canCreate,
}: {
  config: ResourceConfig<R>;
  isFiltered: boolean;
  canCreate: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-6 py-12 text-center">
      {isFiltered ? (
        <>
          <p className="text-base font-medium text-primary">
            Nothing matches these filters
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Try a different status, or clear the filters to see everything.
          </p>
          <p className="mt-6 text-sm">
            <Link
              href={`/admin/${config.name}`}
              className="text-accent underline underline-offset-4 hover:no-underline"
            >
              Clear filters
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="text-base font-medium text-primary">
            No {config.plural.toLowerCase()} yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            {config.emptyMessage}
          </p>
          {canCreate ? (
            <p className="mt-6 text-sm">
              <Link
                href={`/admin/${config.name}/new`}
                className="text-accent underline underline-offset-4 hover:no-underline"
              >
                Add the first {config.singular.toLowerCase()}
              </Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
