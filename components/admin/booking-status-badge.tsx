import { BOOKING_STATUS_LABELS } from "@/lib/admin/booking-view";
import type { BookingStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/**
 * A booking's status, as a word first and a colour second.
 *
 * The label is always the full text from `BOOKING_STATUS_LABELS` — the colour
 * only reinforces it (CLAUDE.md: colour is never the sole state indicator).
 * Someone reading this table in greyscale, with a colour vision deficiency, or
 * through a screen reader gets the same answer as everyone else, so there is no
 * `aria-label` and no visually-hidden twin: the visible text already says it.
 *
 * The tints come from Tailwind's default palette rather than the brand tokens.
 * Spec §4's hex codes are still outstanding (§18) and the theme has exactly one
 * semantic colour for "bad" (`--destructive`) and none for "in progress" or
 * "done" — inventing four brand colours here would be a design decision made in
 * a table cell. Every pairing below is a 700-weight foreground on a 50-weight
 * background, which clears 4.5:1 (spec §13).
 *
 * TODO(brand): revisit once Francis confirms the palette, in case Paelon has
 * house colours for workflow states.
 */

const STATUS_STYLES: Record<BookingStatus, string> = {
  new: "border-blue-200 bg-blue-50 text-blue-700",
  contacted: "border-amber-200 bg-amber-50 text-amber-700",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  completed: "border-slate-200 bg-slate-100 text-slate-700",
  no_show: "border-orange-200 bg-orange-50 text-orange-700",
  cancelled: "border-red-200 bg-red-50 text-red-700",
};

export function BookingStatusBadge({
  status,
  className,
}: {
  status: BookingStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLES[status],
        className,
      )}
    >
      {/* Decorative: the dot repeats the border colour at a size that survives
          a small badge. It carries nothing the word beside it does not. */}
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-current opacity-70"
      />
      {BOOKING_STATUS_LABELS[status]}
    </span>
  );
}
