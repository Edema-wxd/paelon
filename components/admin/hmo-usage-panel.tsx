import { CircleCheck, CircleMinus, CircleSlash } from "lucide-react";

import { hasSiteImage, SiteImage } from "@/components/site/site-image";
import { getMediaById } from "@/lib/db/queries/media";
import type { Hmo } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/**
 * Where an HMO actually appears on the public site, from its saved state.
 *
 * The form's fields used to promise more than the site does — "shown on the
 * HMO check result", "the typeahead lists these" — when the public result
 * shows a name and the word "Accepted", and `/hmo-check` is not built. Staff
 * writing coverage notes believing patients read them is how a hospital ends
 * up with an unreviewed claim it thinks is public, or a public one it thinks
 * is private. This panel says what is true, per surface, and is recomputed on
 * every load so it cannot drift from the code the way a hint can.
 *
 * The logo rule mirrors `components/site/hmo-access-section.tsx`: the
 * committed design asset wins; an upload is used only where none exists.
 */
export async function HmoUsagePanel({ hmo }: { hmo: Hmo }) {
  const builtIn = hasSiteImage("hmo-logo", hmo.slug);
  const upload = hmo.logoId ? await getMediaById(hmo.logoId) : null;
  const searchNames = [hmo.name, ...hmo.aliases];

  const logo: Usage = !hmo.published
    ? { state: "off", title: "Homepage logo strip", detail: "Hidden while this HMO is a draft." }
    : builtIn
      ? {
          state: "on",
          title: "Homepage logo strip",
          detail: upload
            ? "Shows the built-in logo. Your upload is not used while a built-in logo exists."
            : "Shows the built-in logo.",
        }
      : upload
        ? { state: "on", title: "Homepage logo strip", detail: "Shows your uploaded logo." }
        : {
            state: "off",
            title: "Homepage logo strip",
            detail: "Not shown — there is no logo. Upload one under Logo to add it.",
          };

  const search: Usage = hmo.published
    ? {
        state: "on",
        title: "HMO search",
        detail: `On the homepage and in the booking flow. Found by: ${searchNames.join(", ")}.`,
      }
    : { state: "off", title: "HMO search", detail: "Not searchable while this HMO is a draft." };

  const details: Usage = {
    state: "pending",
    title: "Coverage, co-pay, plan notes and branches",
    detail:
      "Saved, but not shown to patients yet: the public result says only “Accepted”, and the HMO check page (/hmo-check) is not built.",
  };

  return (
    <section
      aria-labelledby="hmo-usage-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="hmo-usage-heading" className="text-base font-semibold text-primary">
        Where it appears
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">From the last saved version.</p>

      {builtIn && hmo.published ? (
        <div className="mt-4 flex h-16 items-center justify-center rounded-md border border-border bg-background p-2">
          <SiteImage
            kind="hmo-logo"
            name={hmo.slug}
            alt={`${hmo.name} — built-in logo`}
            className="h-full w-full object-contain"
          />
        </div>
      ) : null}

      <ul className="mt-4 space-y-4">
        {[logo, search, details].map((usage) => (
          <UsageRow key={usage.title} usage={usage} />
        ))}
      </ul>
    </section>
  );
}

interface Usage {
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

function UsageRow({ usage }: { usage: Usage }) {
  const { icon: Icon, label, tone } = STATE[usage.state];
  return (
    <li className="flex gap-2.5">
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone)} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">
          {usage.title}
          {/* The state as a word, not only an icon colour. */}
          <span className={cn("ml-1.5 text-xs font-normal", tone)}>· {label}</span>
        </p>
        <p className="mt-0.5 text-xs leading-relaxed break-words text-muted-foreground">
          {usage.detail}
        </p>
      </div>
    </li>
  );
}
