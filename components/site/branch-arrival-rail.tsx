import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

export interface ArrivalCell {
  /** The signage word. Kept to one or two words so the rail stays scannable. */
  label: string;
  /** What happens when the cell is tapped, or the number that gets dialled. */
  value: string;
  href: string;
  /** Maroon fill. Reserved for the emergency line, which is the one cell that
   *  must be findable without reading. */
  emergency?: boolean;
  /** Hands off to the visitor's maps app or another site. */
  external?: boolean;
  /** Stays on the site and goes deeper into it. */
  onward?: boolean;
}

/**
 * The arrival rail: the actions a person needs in order to get to a branch,
 * welded flush to the bottom edge of the block that names it.
 *
 * This is the one deliberately loud element on the locations templates. It is
 * square where the rest of the site is rounded, and edge-to-edge where the rest
 * is padded, because a branch directory is wayfinding furniture rather than
 * marketing: it should read like the row of signs above a hospital reception
 * desk, not like a card of buttons floating in space.
 *
 * The cell order is the order of a journey — call ahead, know the emergency
 * number, then travel — so the sequence carries information rather than
 * decorating one.
 *
 * Hairlines come from a 1px grid gap over a `--border` background, so adjacent
 * cells share one rule instead of stacking two.
 */
export function BranchArrivalRail({
  cells,
  label,
}: {
  cells: ArrivalCell[];
  /** Names the rail for screen readers, e.g. "Victoria Island quick actions". */
  label: string;
}) {
  // Container queries, not viewport ones: this rail sits full-bleed on a branch
  // page and inside a half-width card on the index, and a phone number that
  // wraps mid-digits is unreadable. It has to respond to its own width.
  //
  // Tailwind cannot see interpolated class names, so the two supported shapes
  // are written out.
  const columns =
    cells.length === 4
      ? "grid-cols-2 @2xl:grid-cols-4"
      : "grid-cols-1 @lg:grid-cols-3";

  return (
    <nav aria-label={label} className="@container border-t border-border">
      <ul className={`grid gap-px bg-border ${columns}`}>
        {cells.map((cell) => {
          const body = (
            <>
              <span
                className={`text-xs font-medium uppercase tracking-[0.14em] ${
                  cell.emergency
                    ? "text-accent-foreground/85"
                    : "text-muted-foreground"
                }`}
              >
                {cell.label}
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap text-base font-medium">
                {cell.value}
                {cell.external ? (
                  <ArrowUpRight className="size-4 shrink-0" aria-hidden />
                ) : null}
                {cell.onward ? (
                  <ArrowRight
                    className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                ) : null}
                {cell.external ? (
                  <span className="sr-only">(opens in a new tab)</span>
                ) : null}
              </span>
            </>
          );

          const className = `group flex h-full flex-col gap-1 px-4 py-4 transition-colors @lg:px-5 ${
            cell.emergency
              ? "bg-accent text-accent-foreground hover:bg-accent/90"
              : "bg-secondary text-foreground hover:bg-surface"
          }`;

          return (
            /* `min-w-0` overrides the `min-width: auto` a grid item gets by
               default. Without it the nowrap phone number below sets a floor
               on the track width, and on a 320px phone the rail would widen
               the page instead of the number simply crowding its own cell. */
            <li key={cell.label} className="min-w-0">
              {cell.external ? (
                <a
                  href={cell.href}
                  target="_blank"
                  rel="noreferrer"
                  className={className}
                >
                  {body}
                </a>
              ) : cell.href.startsWith("tel:") ? (
                <a href={cell.href} className={className}>
                  {body}
                </a>
              ) : (
                <Link href={cell.href} className={className}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
