import { cn } from "@/lib/utils";

/**
 * A contact submission's handled state, as a word first and a colour second.
 *
 * "Handled" / "Not handled" everywhere — the filter, the action button and
 * this badge share one vocabulary, so a person learns it once. Tints match
 * `booking-status-badge.tsx`: not handled reads as "new" (blue), handled as
 * "done" (slate). Colour is never the only signal; the word carries it.
 */
export function ContactHandledBadge({
  handled,
  className,
}: {
  handled: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        handled
          ? "border-slate-200 bg-slate-100 text-slate-700"
          : "border-blue-200 bg-blue-50 text-blue-700",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {handled ? "Handled" : "Not handled"}
    </span>
  );
}
