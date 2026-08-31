"use client";

import { List, MapPin } from "lucide-react";
import { useState } from "react";

/**
 * List / map switch for the branch index (spec §6).
 *
 * A pair of `aria-pressed` toggle buttons rather than the ARIA tabs pattern:
 * tabs owe the user arrow-key roving focus, and hand-rolling that here would
 * ship more JavaScript and more ways to get it wrong than two buttons that
 * already work with Tab and Enter.
 *
 * Both panels are rendered on the server and the inactive one carries the
 * `hidden` attribute, which takes it out of the tab order and the accessibility
 * tree. The switch never fetches, so it stays instant on a slow connection.
 *
 * Pressed state is fill plus weight plus `aria-pressed`, never colour alone
 * (spec §12).
 */
export function LocationsViewToggle({
  heading,
  list,
  map,
}: {
  /** The section heading, laid out on the same row as the switch. */
  heading: React.ReactNode;
  list: React.ReactNode;
  map: React.ReactNode;
}) {
  const [view, setView] = useState<"list" | "map">("list");

  const option = (value: "list" | "map") =>
    `inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-base transition-colors ${
      view === value
        ? "bg-primary font-medium text-primary-foreground"
        : "text-primary hover:bg-muted"
    }`;

  return (
    <>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        {heading}

        <div
          role="group"
          aria-label="Branch view"
          className="inline-flex self-start rounded-full border border-border bg-surface p-1 sm:shrink-0 sm:self-auto"
        >
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            className={option("list")}
          >
            <List className="size-4 shrink-0" aria-hidden />
            List
          </button>
          <button
            type="button"
            aria-pressed={view === "map"}
            onClick={() => setView("map")}
            className={option("map")}
          >
            <MapPin className="size-4 shrink-0" aria-hidden />
            Map
          </button>
        </div>
      </div>

      <div className="mt-10" hidden={view !== "list"}>
        {list}
      </div>
      <div className="mt-10" hidden={view !== "map"}>
        {map}
      </div>
    </>
  );
}
