import Link from "next/link";
import type { Metadata } from "next";

import { NotPermitted } from "@/components/admin/not-permitted";
import {
  auditHref,
  entityHref,
  entityLabel,
  eventLabel,
  isFiltered,
  metadataPairs,
  parseAuditQuery,
  type RawSearchParams,
} from "@/lib/admin/audit-view";
import { paginate } from "@/lib/admin/booking-view";
import { inSentence } from "@/lib/admin/resource-config";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import {
  AUDIT_PAGE_SIZE,
  listAuditActors,
  listAuditEntries,
  listAuditFacets,
} from "@/lib/db/queries/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The audit log viewer (spec §8 Audit log). Admin only, read-only, newest first.
 *
 * Read-only is the point: `can()` refuses every write action on `audit_log` for
 * every role, so there is no control here that changes anything. A log someone
 * can tidy up is not evidence.
 *
 * Opening this page is not itself audited. Auditing reads of the audit log
 * fills it with entries about looking at it.
 *
 * Events and tables are shown in words (`eventLabel`, `entityLabel`); the
 * stored codes stay the filter values, and each event's code is kept beside its
 * label so a row can still be matched to the code that wrote it.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Audit log",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Lagos time, stated. The server formats this, and on Vercel the server runs in
 * UTC, so without a fixed zone every time was an hour behind what the staff
 * reading it would expect.
 */
function formatDateTime(value: Date): string {
  return new Date(value).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "audit_log")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const query = parseAuditQuery(await searchParams);
  const [page, facets, actors] = await Promise.all([
    listAuditEntries(query.filters, query.page),
    listAuditFacets(),
    listAuditActors(),
  ]);

  const pages = paginate(page.total, page.page, AUDIT_PAGE_SIZE);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-primary">Audit log</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Every change made in this panel — content, publishing, page layouts,
        media, staff accounts, and the status of bookings and enquiries — plus
        sign-ins, scripts run against the database, and each opening of a
        booking, contact message or corporate enquiry. Read-only: entries cannot
        be edited or removed from here. IP addresses are stored as a salted
        hash, never as an address. Times are Lagos time.
      </p>

      <section aria-labelledby="audit-filters-heading" className="mt-8">
        <h2 id="audit-filters-heading" className="sr-only">
          Filter the audit log
        </h2>
        <form
          method="get"
          action="/admin/audit"
          className="grid gap-4 rounded-xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <div className="space-y-1">
            <label htmlFor="audit-action" className="block text-xs text-muted-foreground">
              Event
            </label>
            <select
              id="audit-action"
              name="action"
              defaultValue={query.filters.action ?? ""}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground"
            >
              <option value="">All events</option>
              {facets.actions.map((action) => (
                <option key={action} value={action}>
                  {eventLabel(action)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="audit-entity" className="block text-xs text-muted-foreground">
              Entity
            </label>
            <select
              id="audit-entity"
              name="entity"
              defaultValue={query.filters.entityType ?? ""}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground"
            >
              <option value="">All entities</option>
              {facets.entityTypes.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {entityLabel(entityType)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="audit-actor" className="block text-xs text-muted-foreground">
              Who
            </label>
            <select
              id="audit-actor"
              name="actor"
              defaultValue={query.filters.actor ?? ""}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground"
            >
              <option value="">Anyone</option>
              {/* A failed sign-in has no account behind it yet, and a seed
                  or sync script runs as nobody. */}
              <option value="system">No account (sign-in attempts and scripts)</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="audit-from" className="block text-xs text-muted-foreground">
              From
            </label>
            <Input
              id="audit-from"
              name="from"
              type="date"
              defaultValue={query.filters.from ?? ""}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="audit-to" className="block text-xs text-muted-foreground">
              To
            </label>
            <Input
              id="audit-to"
              name="to"
              type="date"
              defaultValue={query.filters.to ?? ""}
            />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-5">
            <Button type="submit" size="sm">
              Apply filters
            </Button>
            {isFiltered(query) ? (
              <Link
                href="/admin/audit"
                className="text-sm text-accent underline underline-offset-4 hover:no-underline"
              >
                Clear filters
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <section aria-labelledby="audit-entries-heading" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="audit-entries-heading" className="text-lg font-medium text-primary">
            {page.total} {page.total === 1 ? "entry" : "entries"}
          </h2>
          {page.total > 0 ? (
            <p className="text-sm text-muted-foreground">
              Showing {pages.from}–{pages.to} of {pages.total}
            </p>
          ) : null}
        </div>

        {page.entries.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border bg-white px-6 py-10 text-center text-sm text-muted-foreground">
            No entries match these filters.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Audit log entries, newest first
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="p-3 font-medium text-primary">
                    When <span className="font-normal text-muted-foreground">(Lagos)</span>
                  </th>
                  <th scope="col" className="p-3 font-medium text-primary">
                    Who
                  </th>
                  <th scope="col" className="p-3 font-medium text-primary">
                    Event
                  </th>
                  <th scope="col" className="p-3 font-medium text-primary">
                    Entity
                  </th>
                  <th scope="col" className="p-3 font-medium text-primary">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.entries.map((entry) => {
                  const href = entityHref(entry.entityType, entry.entityId, entry.action);
                  const label = entityLabel(entry.entityType);
                  const viaScript = entry.metadata.via === "cli";
                  const pairs = metadataPairs(entry.metadata);

                  return (
                    <tr key={entry.id} className="border-b border-border last:border-0">
                      <td className="p-3 whitespace-nowrap">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="p-3">
                        {entry.actorName ?? (
                          <span className="text-muted-foreground">
                            {viaScript ? "Script" : "No account"}
                          </span>
                        )}
                        {/* Enough of the hash to match two events from one
                            client, which is all a hash is useful for. */}
                        {entry.ipAddress ? (
                          <span
                            className="block font-mono text-xs text-muted-foreground"
                            title="Salted hash of the client IP address"
                          >
                            {entry.ipAddress.slice(0, 12)}…
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3">
                        <span className="font-medium text-primary">{eventLabel(entry.action)}</span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {entry.action}
                        </span>
                      </td>
                      <td className="p-3">
                        {label}
                        {href ? (
                          <Link
                            href={href}
                            className="block text-xs text-accent underline underline-offset-4 hover:no-underline"
                          >
                            Open {inSentence(label)}
                          </Link>
                        ) : null}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {pairs.length === 0 ? (
                          "—"
                        ) : (
                          <dl className="space-y-0.5">
                            {pairs.map((pair) => (
                              <div key={pair.key} className="flex gap-1">
                                <dt className="font-medium">{pair.key}:</dt>
                                <dd className="break-all">{pair.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages.pages > 1 ? (
          <nav
            aria-label="Audit log pagination"
            className="mt-6 flex items-center justify-between gap-4"
          >
            {pages.page > 1 ? (
              <Link
                href={auditHref(query, { page: pages.page - 1 })}
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
                href={auditHref(query, { page: pages.page + 1 })}
                className="text-sm text-accent underline underline-offset-4 hover:no-underline"
              >
                Next page
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
