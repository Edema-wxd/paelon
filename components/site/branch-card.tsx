import Link from "next/link";

import {
  BranchArrivalRail,
  type ArrivalCell,
} from "@/components/site/branch-arrival-rail";
import { PendingNote } from "@/components/site/pending-note";
import {
  formatAddress,
  toDirectionsHref,
  toTelHref,
  type Location,
} from "@/lib/content";
import {
  describeDay,
  hasPublishedHours,
  todayInLagos,
} from "@/lib/locations/hours-display";

/**
 * One branch on the index: name, today's hours, and the arrival rail.
 *
 * Spec §6 also asks for a services count per branch. It is not rendered: the
 * `service_locations` join is empty in the seed (services.json still carries
 * `branch_ids: []` rather than `location_slugs`), so any number here would be
 * invented. See seed/README.md.
 */
export function BranchCard({ location }: { location: Location }) {
  const cells: ArrivalCell[] = [
    {
      label: "Call",
      value: location.phone,
      href: toTelHref(location.phone),
    },
    {
      label: "Emergency",
      value: location.emergency_line,
      href: toTelHref(location.emergency_line),
      emergency: true,
    },
    {
      label: "Directions",
      value: "Open in maps",
      href: toDirectionsHref(location),
      external: true,
    },
    {
      label: "Branch",
      value: "Full details",
      href: `/locations/${location.slug}`,
      onward: true,
    },
  ];

  const hours = location.hours;

  return (
    /* A container, not a viewport, query: one seeded branch spans the full
       content width while four sit two-up, and the card has to lay itself out
       from its own width either way. */
    <article className="@container overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-col gap-6 p-6 @3xl:flex-row @3xl:items-start @3xl:justify-between @3xl:gap-12 @3xl:p-8">
        <div>
          <h3 className="text-2xl font-medium uppercase tracking-[0.08em] text-primary @3xl:text-3xl">
            <Link
              href={`/locations/${location.slug}`}
              className="rounded-md transition-colors hover:text-accent"
            >
              {location.name}
            </Link>
          </h3>

          {/* Set larger than body copy on purpose: this is the line a patient
              reads out to a driver, so it has to survive a glance at arm's
              length in a moving car. */}
          <address className="mt-4 max-w-md text-lg not-italic leading-relaxed text-foreground/85">
            {formatAddress(location)}
          </address>
        </div>

        <div className="@3xl:w-80 @3xl:shrink-0">
          {hasPublishedHours(hours) ? (
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Today
              </span>
              <span className="text-base font-medium">
                {describeDay(hours[todayInLagos()])}
              </span>
            </p>
          ) : (
            <PendingNote>
              Opening hours have not been confirmed for this branch. Call ahead
              before you travel.
            </PendingNote>
          )}
        </div>
      </div>

      <BranchArrivalRail
        cells={cells}
        label={`${location.name} contact and directions`}
      />
    </article>
  );
}
