import { cn } from "@/lib/utils";

/**
 * A content row's published state, as a word first and a colour second —
 * the same badge shape as `booking-status-badge.tsx`, so every status in the
 * panel reads alike.
 */
export function PublishedBadge({
  published,
  className,
}: {
  published: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        published
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-100 text-slate-700",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {published ? "Published" : "Draft"}
    </span>
  );
}
