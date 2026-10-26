import { CircleCheck, CircleMinus, CircleSlash } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The "Where it appears" panel beside an editor's Publishing card: a shell and
 * a list of surfaces, each shown, not shown, or stored with no surface yet.
 *
 * Shared so every content type that grows one reads the same way. The panels
 * themselves (`hmo-usage-panel.tsx`, `testimonial-usage-panel.tsx`) decide the
 * states from the saved row; this only lays them out. The state is always a
 * word as well as an icon colour (spec §12).
 */

export interface Usage {
  /** on: live on the site · off: not shown · pending: stored, no surface yet. */
  state: "on" | "off" | "pending";
  title: string;
  detail: string;
}

const STATE = {
  on: { icon: CircleCheck, label: "Shown", tone: "text-emerald-700" },
  off: { icon: CircleMinus, label: "Not shown", tone: "text-muted-foreground" },
  pending: { icon: CircleSlash, label: "Not shown yet", tone: "text-amber-700" },
} as const;

export function UsagePanel({
  id,
  usages,
  children,
}: {
  /** Prefix for the heading id, unique on the page. */
  id: string;
  usages: readonly Usage[];
  /** Shown between the heading and the list — a logo, a name preview. */
  children?: React.ReactNode;
}) {
  const headingId = `${id}-usage-heading`;
  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-border bg-surface p-5">
      <h2 id={headingId} className="text-base font-semibold text-primary">
        Where it appears
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">From the last saved version.</p>

      {children}

      <ul className="mt-4 space-y-4">
        {usages.map((usage) => {
          const { icon: Icon, label, tone } = STATE[usage.state];
          return (
            <li key={usage.title} className="flex gap-2.5">
              <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone)} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary">
                  {usage.title}
                  <span className={cn("ml-1.5 text-xs font-normal", tone)}>· {label}</span>
                </p>
                <p className="mt-0.5 text-xs leading-relaxed break-words text-muted-foreground">
                  {usage.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
