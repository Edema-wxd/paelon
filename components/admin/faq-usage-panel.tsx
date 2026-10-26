import { UsagePanel, type Usage } from "@/components/admin/usage-panel";
import { listFaqServices } from "@/lib/db/queries/faqs";
import type { Faq } from "@/lib/db/schema";

/**
 * Where an FAQ appears, from its saved state.
 *
 * Since 2026-10-26 a service page shows only the FAQs assigned to it, so an
 * FAQ that is neither "General" nor assigned to a service is published but
 * appears nowhere — easy to miss from the form, and stated here plainly.
 */
export async function FaqUsagePanel({ faq }: { faq: Faq }) {
  const assigned = await listFaqServices(faq.id);
  const live = assigned.filter((service) => service.published);
  const drafts = assigned.length - live.length;

  if (!faq.published) {
    return (
      <UsagePanel
        id="faq"
        usages={[{ state: "off", title: "Anywhere", detail: "Not shown: this FAQ is a draft." }]}
      />
    );
  }

  const general: Usage =
    faq.category === "general"
      ? {
          state: "on",
          title: "Homepage and branch pages",
          detail: "Shown in “Common questions”, because its category is General.",
        }
      : {
          state: "off",
          title: "Homepage and branch pages",
          detail: "Not shown: only General FAQs appear there.",
        };

  const servicePages: Usage =
    live.length > 0
      ? {
          state: "on",
          title: "Service pages",
          detail: `Shown on ${live.map((service) => service.name).join(", ")}.${
            drafts > 0 ? ` ${drafts} more assigned service${drafts === 1 ? " is a draft" : "s are drafts"}.` : ""
          }`,
        }
      : {
          state: "off",
          title: "Service pages",
          detail:
            drafts > 0
              ? "Not shown: every service it is assigned to is a draft."
              : "Not shown: it is not assigned to any service. Tick one under Service pages.",
        };

  const nowhere = general.state === "off" && servicePages.state === "off";

  return (
    <UsagePanel id="faq" usages={[general, servicePages]}>
      {nowhere ? (
        <p
          role="note"
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800"
        >
          Published, but it appears on no page. Assign it to a service, or make it General.
        </p>
      ) : null}
    </UsagePanel>
  );
}
