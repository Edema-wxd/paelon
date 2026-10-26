import { HOMEPAGE_TESTIMONIAL_LIMIT, getHomepageTestimonialIds } from "@/lib/db/queries/testimonials";
import type { Testimonial } from "@/lib/db/schema";
import { displayPatientName } from "@/lib/testimonials/display-name";
import { UsagePanel, type Usage } from "@/components/admin/usage-panel";

/**
 * Where a testimonial actually appears, and under what name, from its saved
 * state.
 *
 * Three things decide whether a patient's words go public — published,
 * consent recorded, featured — plus the homepage's limit of
 * `HOMEPAGE_TESTIMONIAL_LIMIT`. Getting any one wrong is invisible from the
 * form, so this says which applies, by name, after every save. The name line
 * is the exact string the site renders (`displayPatientName`), so whoever
 * records consent sees what the patient agreed to before it is live.
 */
export async function TestimonialUsagePanel({ testimonial }: { testimonial: Testimonial }) {
  const shownIds = await getHomepageTestimonialIds();
  const position = shownIds.indexOf(testimonial.id);
  const shownName = displayPatientName(testimonial.patientName, testimonial.nameFormat);

  const homepage: Usage = !testimonial.published
    ? { state: "off", title: "Homepage", detail: "Not shown: this testimonial is a draft." }
    : !testimonial.consentGiven
      ? {
          state: "off",
          title: "Homepage",
          detail: "Not shown: no consent is recorded. Nothing else here can make it public.",
        }
      : !testimonial.featured
        ? { state: "off", title: "Homepage", detail: "Not shown: it is not featured." }
        : position === -1
          ? {
              state: "off",
              title: "Homepage",
              detail: `Not shown: the homepage shows the first ${HOMEPAGE_TESTIMONIAL_LIMIT} featured quotes by order, and this is not one of them. Lower its order number to move it up.`,
            }
          : {
              state: "on",
              title: "Homepage",
              detail: `Shown, ${ordinal(position + 1)} of ${shownIds.length}, in “Warmth in Every Journey”.`,
            };

  const stored: Usage = {
    state: "pending",
    title: "Service, branch and photograph",
    detail:
      "Saved, but not shown anywhere yet: no service or branch page lists testimonials, and the homepage card does not use the photograph.",
  };

  return (
    <UsagePanel id="testimonial" usages={[homepage, stored]}>
      <div className="mt-4 rounded-md border border-border bg-background px-3 py-2">
        <p className="text-xs text-muted-foreground">Name as shown on the site</p>
        <p className="mt-0.5 text-sm font-medium break-words text-primary">
          {shownName || "—"}
        </p>
      </div>
    </UsagePanel>
  );
}

function ordinal(n: number): string {
  return ["first", "second", "third", "fourth"][n - 1] ?? `#${n}`;
}
