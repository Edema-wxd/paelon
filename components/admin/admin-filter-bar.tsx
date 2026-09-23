import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The `<form method="get">` shell every admin list-view filter bar uses.
 *
 * Extracted from `booking-filters.tsx`: a plain GET form so the filtered view
 * is a URL — bookmarkable, shareable, working with the back button, no client
 * state (CLAUDE.md: no state library). Resource-specific fields are `children`;
 * this owns only the shell, the "Apply filters" submit and the conditional
 * "Clear filters" link.
 */
export function AdminFilterBar({
  action,
  hidden,
  isFiltered,
  clearHref,
  children,
}: {
  /** The list route this filter form submits to, e.g. `/admin/contact`. */
  action: string;
  /** Query state to carry through unchanged — e.g. the current sort. */
  hidden?: { name: string; value: string }[];
  isFiltered: boolean;
  /** Where "Clear filters" goes — normally just `action`. */
  clearHref: string;
  children: React.ReactNode;
}) {
  return (
    <form
      method="get"
      action={action}
      className="rounded-xl border border-border bg-white p-4"
    >
      {(hidden ?? []).map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}

      {children}

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" size="sm">
          Apply filters
        </Button>
        {isFiltered ? (
          <Link
            href={clearHref}
            className="text-sm text-accent underline underline-offset-4 hover:no-underline"
          >
            Clear filters
          </Link>
        ) : null}
      </div>
    </form>
  );
}
