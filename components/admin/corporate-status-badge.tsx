import { CORPORATE_STATUS_LABELS } from "@/lib/admin/corporate-view";
import type { CorporateStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/**
 * A corporate enquiry's status, as a word first and a colour second. Mirrors
 * `booking-status-badge.tsx` — see that component's comment for why the label
 * is always the full text and the colours are Tailwind defaults pending
 * Francis's brand palette (TODO(brand)).
 */

const STATUS_STYLES: Record<CorporateStatus, string> = {
  new: "border-blue-200 bg-blue-50 text-blue-700",
  contacted: "border-amber-200 bg-amber-50 text-amber-700",
  proposal_sent: "border-purple-200 bg-purple-50 text-purple-700",
  won: "border-emerald-200 bg-emerald-50 text-emerald-700",
  lost: "border-red-200 bg-red-50 text-red-700",
};

export function CorporateStatusBadge({
  status,
  className,
}: {
  status: CorporateStatus;
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
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {CORPORATE_STATUS_LABELS[status]}
    </span>
  );
}
