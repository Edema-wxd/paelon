"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";

export interface Destination {
  href: string;
  label: string;
  /**
   * The single piece of secondary information per row. For a service this is
   * its family, for a branch its city. One slot only, so the board stays a
   * directory rather than a card grid.
   */
  meta: string;
}

interface WayfindingBoardProps {
  destinations: readonly Destination[];
  /** Shown in the no-match state so the page never dead-ends. Null when no branch is seeded. */
  emergencyPhone: string | null;
  emergencyTelHref: string | null;
}

/**
 * The 404 page's directory (spec §6: "search bar linking to services /
 * locations").
 *
 * The search field filters this list in place rather than opening a dropdown.
 * One surface instead of two means no popup to focus-trap, no result list that
 * disagrees with the browse list, and the same interaction on touch and
 * pointer. Match counts go to a live region because a silently shrinking list
 * is invisible to a screen-reader user.
 *
 * Every row is a real destination, built from seed data by the caller. Nothing
 * here links to a page that does not exist.
 *
 * Deliberately not importing from `lib/content` — that module pulls the seed
 * JSON in at the top level, and this is a client component. Destinations and
 * the emergency number arrive as props so none of the seed reaches the bundle.
 */
export function WayfindingBoard({
  destinations,
  emergencyPhone,
  emergencyTelHref,
}: WayfindingBoardProps) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const listId = useId();

  const trimmed = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!trimmed) return destinations;
    return destinations.filter(
      (destination) =>
        destination.label.toLowerCase().includes(trimmed) ||
        destination.meta.toLowerCase().includes(trimmed),
    );
  }, [destinations, trimmed]);

  return (
    <section aria-labelledby="wayfinding-heading">
      <h2 id="wayfinding-heading" className="text-2xl text-primary lg:text-3xl">
        Find where you were going
      </h2>

      <div className="mt-6 max-w-lg">
        <label htmlFor={inputId} className="block text-base font-medium">
          Search departments and branches
        </label>

        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={inputId}
            type="search"
            autoComplete="off"
            aria-controls={listId}
            aria-describedby={`${inputId}-hint`}
            placeholder="Paediatrics, Victoria Island, booking"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-14 rounded-full pl-11 text-base"
          />
        </div>

        <p
          id={`${inputId}-hint`}
          className="mt-2 text-sm text-muted-foreground"
        >
          Filters the list below as you type.
        </p>
      </div>

      <div aria-live="polite" className="sr-only">
        {trimmed
          ? `${matches.length} ${matches.length === 1 ? "result" : "results"}`
          : ""}
      </div>

      {matches.length > 0 ? (
        <ul id={listId} className="mt-8 border-t border-border">
          {matches.map((destination) => (
            <li key={destination.href + destination.label}>
              <Link
                href={destination.href}
                className="group flex items-center gap-4 border-b border-border px-2 py-5 transition-colors hover:bg-muted sm:px-4"
              >
                {/* One meta node, moved by CSS rather than duplicated per
                    breakpoint: it stacks under the label on narrow screens and
                    sits at the right edge from `sm` up. */}
                <span className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
                  <span className="block text-lg text-primary underline-offset-4 group-hover:underline lg:text-xl">
                    {destination.label}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground sm:mt-0 sm:shrink-0">
                    {destination.meta}
                  </span>
                </span>

                <ChevronRight
                  className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-1"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        /* An empty result is an invitation to act, not a dead end. */
        <div
          id={listId}
          className="mt-8 rounded-lg border border-border bg-surface p-6"
        >
          <p className="text-lg text-primary">
            Nothing on the site matches &ldquo;{query.trim()}&rdquo;.
          </p>
          <p className="mt-3 text-base text-muted-foreground">
            {emergencyPhone && emergencyTelHref ? (
              <>
                Call us on{" "}
                <a
                  href={emergencyTelHref}
                  className="text-accent underline underline-offset-4 hover:no-underline"
                >
                  {emergencyPhone}
                </a>{" "}
                or{" "}
              </>
            ) : null}
            <Link
              href="/contact"
              className="text-accent underline underline-offset-4 hover:no-underline"
            >
              send us a message
            </Link>{" "}
            and we will point you to the right place.
          </p>
        </div>
      )}
    </section>
  );
}
