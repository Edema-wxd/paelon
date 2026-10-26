import { UsagePanel, type Usage } from "@/components/admin/usage-panel";
import type { Award } from "@/lib/db/schema";

/**
 * Where an award appears, from its saved state. An award is a public claim
 * about the hospital, so whoever publishes one should see exactly where it
 * lands — the About page timeline — and that the logo and certificate they
 * attached are records, not display.
 */
export function AwardUsagePanel({ award }: { award: Award }) {
  const timeline: Usage = award.published
    ? {
        state: "on",
        title: "About page timeline",
        detail: award.externalLink
          ? `Shown under “Awards and accreditations”, with a link to ${award.awardingBody}’s page.`
          : "Shown under “Awards and accreditations”.",
      }
    : { state: "off", title: "About page timeline", detail: "Not shown: this award is a draft." };

  const images: Usage = {
    state: "pending",
    title: "Logo and certificate",
    detail: "Saved as the record behind the claim. No page shows them yet.",
  };

  return <UsagePanel id="award" usages={[timeline, images]} />;
}
