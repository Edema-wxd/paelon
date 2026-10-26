import { ChevronDown } from "lucide-react";

import type { Faq } from "@/lib/content";
import { serializeJsonLd } from "@/lib/json-ld";
import { toPlainText } from "@/lib/markdown";
import { ArticleBody } from "@/components/site/article-body";

/**
 * FAQ accordion and its `FAQPage` JSON-LD (CLAUDE.md baseline item 3, spec §11).
 *
 * Native `<details>`/`<summary>`: no state library, no client component, and it
 * works with JavaScript disabled. The answers are real text in the HTML at all
 * times — collapsed, not absent — which is what the baseline requires and what
 * makes them eligible for a rich result. Injecting an answer on expand would
 * hide it from crawlers and from anyone using find-in-page.
 *
 * Renders nothing when there are no FAQs. An empty accordion with a heading is
 * worse than no section, and the `faqs` table is currently empty — the seed for
 * it has not been written.
 */
export function FaqSection({
  faqs,
  heading = "Common questions",
  headingId = "faq-heading",
  className,
}: {
  faqs: Faq[];
  heading?: string;
  headingId?: string;
  className?: string;
}) {
  if (faqs.length === 0) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      // Plain text: the answer is Markdown, and `**` or `[text](/path)` read
      // as noise in a search result.
      acceptedAnswer: { "@type": "Answer", text: toPlainText(faq.answer) },
    })),
  };

  return (
    <section
      aria-labelledby={headingId}
      className={className ?? "bg-surface py-16 lg:py-24"}
    >
      <script
        type="application/ld+json"
        // serializeJsonLd escapes `<` and friends: values here include admin-edited content.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-25">
        <h2 id={headingId} className="text-3xl text-accent lg:text-4xl">
          {heading}
        </h2>

        <ul className="mt-10 max-w-3xl divide-y divide-border border-t border-b border-border">
          {faqs.map((faq) => (
            <li key={faq.id}>
              <details className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md text-lg font-medium text-primary [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  {/* Rotates to signal state, but the open/closed state is also
                      carried by the element itself, so this is never the only
                      indicator. */}
                  <ChevronDown
                    aria-hidden
                    className="size-5 shrink-0 text-accent transition-transform group-open:rotate-180"
                  />
                </summary>
                {/* Markdown, through the renderer the admin preview uses (D1),
                    so links in an answer are links. The schema refuses
                    headings: an answer sits under its question. */}
                <div className="mt-3">
                  <ArticleBody source={faq.answer} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
