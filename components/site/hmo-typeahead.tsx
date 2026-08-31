"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import type { Hmo } from "@/lib/content";
import { searchHmos } from "@/lib/hmo-search";

interface HmoTypeaheadProps {
  hmos: readonly Hmo[];
}

/**
 * HMO confirmation widget (spec §6). Filters the seeded HMO list as the user
 * types.
 *
 * Absent from the Figma export, which shows only a static logo strip.
 *
 * Implemented as an ARIA 1.2 combobox: the input owns `aria-expanded` and
 * `aria-controls`, results are a `listbox`, and the active result is tracked
 * with `aria-activedescendant` so screen-reader users hear the selection move
 * without focus leaving the input. Result counts are announced via a live
 * region, since a silently-shrinking list is invisible to non-sighted users.
 */
export function HmoTypeahead({ hmos }: HmoTypeaheadProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputId = useId();
  const listId = useId();

  const trimmed = query.trim();

  /**
   * Matching lives in `lib/hmo-search` so it can be unit tested without a
   * DOM. A plain `includes()` here missed "Leadway Health" and "Avon HMO" —
   * the names printed on the logos directly above this input.
   */
  const matches = useMemo(() => searchHmos(hmos, trimmed), [hmos, trimmed]);

  const expanded = trimmed.length > 0;
  const activeId =
    expanded && matches[activeIndex] ? `${listId}-${activeIndex}` : undefined;

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!expanded || matches.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
    } else if (event.key === "Escape") {
      setQuery("");
    }
  }

  return (
    <div className="w-full max-w-lg">
      <label htmlFor={inputId} className="block text-base font-medium">
        Check if we accept your HMO
      </label>

      <div className="relative mt-2">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-describedby={`${inputId}-hint`}
          placeholder="Start typing your HMO name"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          className="h-14 rounded-full pl-11 text-base"
        />
      </div>

      <p id={`${inputId}-hint`} className="mt-2 text-sm text-muted-foreground">
        We work with a range of providers. Search to confirm yours.
      </p>

      <div aria-live="polite" className="sr-only">
        {expanded
          ? `${matches.length} ${matches.length === 1 ? "provider" : "providers"} found`
          : ""}
      </div>

      {expanded ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching HMOs"
          className="mt-3 overflow-hidden rounded-lg border border-border bg-surface"
        >
          {matches.length > 0 ? (
            matches.map((hmo, index) => (
              <li
                key={hmo.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex
                    ? "flex items-center justify-between gap-3 bg-muted px-4 py-3"
                    : "flex items-center justify-between gap-3 px-4 py-3"
                }
              >
                <span className="text-base">{hmo.name}</span>
                {/* TODO(seed): per-branch acceptance and copay are unknown, so
                    no coverage claim is made here. The /hmo-check template
                    (spec §6) is where the detail belongs once seeded. */}
                <span className="text-sm text-muted-foreground">Accepted</span>
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-base">
              We may still be able to help.{" "}
              <Link
                href="/contact"
                className="text-accent underline underline-offset-4 hover:no-underline"
              >
                Contact us about your cover
              </Link>
              .
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
