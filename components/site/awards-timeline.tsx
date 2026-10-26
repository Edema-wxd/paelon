import { ExternalLink } from "lucide-react";

import { ArticleBody } from "@/components/site/article-body";
import type { Award } from "@/lib/content";

/**
 * Awards and accreditations as a timeline (spec §6 About: "Awards and
 * accreditations as a scrollable timeline").
 *
 * An ordered list, because the order is the meaning — these are dated events in
 * the hospital's history, newest first. "Scrollable" is the page's own scroll on
 * mobile rather than a horizontal rail: a horizontal scroller hides items from
 * anyone who does not think to drag it, and gives keyboard users a scroll
 * container with no visible affordance.
 *
 * Renders nothing when no award is published — `seed/awards.json` does not
 * exist, so that is the state today. An award is a claim that a named body gave
 * this hospital something, which CLAUDE.md puts firmly out of reach of a
 * placeholder.
 */
export function AwardsTimeline({ awards }: { awards: Award[] }) {
  if (awards.length === 0) return null;

  return (
    <section aria-labelledby="awards-heading" className="mt-16">
      <h2 id="awards-heading" className="text-2xl text-accent lg:text-3xl">
        Awards and accreditations
      </h2>

      <ol className="mt-8 space-y-8 border-l-2 border-border pl-6">
        {awards.map((award) => (
          <li key={award.id} className="relative">
            {/* Decorative marker on the rail. `aria-hidden` because the list
                structure already conveys the sequence. */}
            <span
              aria-hidden
              className="absolute -left-[1.9375rem] top-2 size-3 rounded-full bg-accent"
            />

            <p className="text-sm font-medium text-muted-foreground">
              {award.year}
            </p>
            <h3 className="mt-1 text-lg font-medium text-primary">
              {award.name}
            </h3>
            <p className="mt-1 text-base text-foreground/80">
              {award.awarding_body}
            </p>

            {/* Markdown, through the renderer the admin preview uses (D1), so
                emphasis and links render rather than showing as `**`. The
                schema refuses headings here: this sits under the award's h3. */}
            {award.description ? (
              <div className="mt-2">
                <ArticleBody source={award.description} />
              </div>
            ) : null}

            {award.external_link ? (
              <p className="mt-2">
                <a
                  href={award.external_link}
                  // An awarding body is a third party; `noopener` on every
                  // external target, and the relationship is stated.
                  target="_blank"
                  rel="noopener external"
                  className="inline-flex items-center gap-1 text-sm text-accent underline underline-offset-4 hover:no-underline"
                >
                  {award.name} on {award.awarding_body}&rsquo;s website
                  <ExternalLink aria-hidden className="size-3.5" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
