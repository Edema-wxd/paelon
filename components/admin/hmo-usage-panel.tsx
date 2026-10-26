import { hasSiteImage, SiteImage } from "@/components/site/site-image";
import { getMediaById } from "@/lib/db/queries/media";
import type { Hmo } from "@/lib/db/schema";
import { UsagePanel, type Usage } from "@/components/admin/usage-panel";

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
 * The logo rule mirrors `components/site/hmo-access-section.tsx` (since #9):
 * an upload with recorded dimensions wins; otherwise the built-in file for the
 * slug is used.
 */
export async function HmoUsagePanel({ hmo }: { hmo: Hmo }) {
  const builtIn = hasSiteImage("hmo-logo", hmo.slug);
  const upload = hmo.logoId ? await getMediaById(hmo.logoId) : null;
  const searchNames = [hmo.name, ...hmo.aliases];

  // Dimensions decide it, as on the homepage: `next/image` cannot reserve space
  // for an unsized upload, so the strip falls back to the built-in file.
  const usableUpload = upload !== null && upload.width !== null && upload.height !== null;

  const logo: Usage = !hmo.published
    ? { state: "off", title: "Homepage logo strip", detail: "Hidden while this HMO is a draft." }
    : usableUpload
      ? {
          state: "on",
          title: "Homepage logo strip",
          detail: builtIn
            ? "Shows your uploaded logo, in place of the built-in one."
            : "Shows your uploaded logo.",
        }
      : builtIn
        ? {
            state: "on",
            title: "Homepage logo strip",
            detail: upload
              ? "Shows the built-in logo: your upload has no recorded size. Re-upload it to use it."
              : "Shows the built-in logo.",
          }
        : {
            state: "off",
            title: "Homepage logo strip",
            detail: upload
              ? "Not shown — the upload has no recorded size. Re-upload it."
              : "Not shown — there is no logo. Upload one under Logo to add it.",
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
    <UsagePanel id="hmo" usages={[logo, search, details]}>
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
    </UsagePanel>
  );
}
