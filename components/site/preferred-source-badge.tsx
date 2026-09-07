import { Star } from "lucide-react";

import { clientEnv } from "@/lib/env";
import { preferredSourceUrl } from "@/lib/seo";

/**
 * "Preferred source" badge for Google Search.
 *
 * A reader who adds Paelon as a preferred source sees our articles surfaced
 * more often in Top Stories, AI Mode and AI Overviews. Google's own badge
 * assets are hosted images and its recommended button is a third-party script;
 * neither fits the §13 budgets, so this is the sanctioned deeplink form with
 * our own styling, which Google explicitly allows.
 *
 * Renders nothing without a public host — see `preferredSourceUrl`.
 */
export function PreferredSourceBadge({ className }: { className?: string }) {
  const href = preferredSourceUrl(clientEnv.NEXT_PUBLIC_SITE_URL);

  if (!href) return null;

  return (
    <aside
      aria-labelledby="preferred-source-heading"
      className={`rounded-xl border border-border p-6 ${className ?? ""}`}
    >
      <h2
        id="preferred-source-heading"
        className="flex items-center gap-2 text-base font-medium text-primary"
      >
        <Star className="size-4 text-accent" aria-hidden />
        Follow our health articles on Google
      </h2>

      <p className="mt-2 max-w-prose text-sm text-foreground/80">
        Choose Paelon Memorial as a preferred source and our articles show up
        more often when you search health topics on Google.
      </p>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground/80 hover:border-accent hover:text-accent"
      >
        <Star className="size-4" aria-hidden />
        Add Paelon Memorial as a preferred source
        <span className="sr-only">(opens Google in a new tab)</span>
      </a>
    </aside>
  );
}
