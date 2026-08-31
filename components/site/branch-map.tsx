import { ArrowUpRight } from "lucide-react";

import { AssetPlaceholder } from "@/components/site/asset-placeholder";
import { formatAddress, toDirectionsHref, type Location } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * The map panel for one branch.
 *
 * Deliberately not an embedded map. middleware.ts ships `frame-src 'none'` and
 * documents why: a Google Maps iframe sets third-party cookies, which would
 * undermine master spec §14's "no cookie banner required" position, and it
 * costs the spec §13 performance budget. The prescribed shape there is a static
 * map image plus a directions link, and that is what this renders.
 *
 * TODO(francis): the map provider is still undecided (backend spec §18/§25).
 * Once one is chosen, the static tile replaces the placeholder below and its
 * origin joins `img-src` in middleware.ts. Coordinates are also needed —
 * locations.json has no latitude or longitude, so the directions link resolves
 * by address string, which can land on the wrong side of a Lagos street.
 */
export function BranchMap({
  location,
  className,
}: {
  location: Location;
  className?: string;
}) {
  const address = formatAddress(location);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-surface",
        className,
      )}
    >
      {/* A fixed band rather than an aspect ratio: at 16:9 across a 768px
          column this is 430px of empty grey while the tile is still a
          placeholder, and a static map does not need more height than this
          once it lands. */}
      <AssetPlaceholder
        label={`Map of ${location.name}`}
        className="h-56 w-full sm:h-72"
      />

      <div className="flex flex-col gap-4 border-t border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <address className="text-base not-italic text-foreground">
          {address}
        </address>

        <a
          href={toDirectionsHref(location)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md text-base font-medium text-accent underline underline-offset-4"
        >
          Open directions
          <ArrowUpRight className="size-4 shrink-0" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
