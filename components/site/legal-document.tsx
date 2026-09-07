import Link from "next/link";

import { PendingNote } from "@/components/site/pending-note";
import { formatEffectiveDate, type LegalDocument } from "@/lib/legal";

interface LegalDocumentViewProps {
  document: LegalDocument;
  /** Where to send someone whose question the document does not answer. */
  contactHref?: string;
}

/**
 * Renders a legal document (master spec §6). Document-agnostic: `/privacy` uses
 * this too once its draft lands.
 *
 * Sections are numbered because a legal document genuinely is a numbered
 * sequence — people cite "section 4" in correspondence, and the anchors are
 * stable ids rather than slugified headings so a reworded heading does not
 * break a link someone has already sent. The numbering is the one structural
 * device here; everything else stays quiet, which is the right register for a
 * page nobody reads for pleasure.
 */
export function LegalDocumentView({
  document,
  contactHref = "/contact",
}: LegalDocumentViewProps) {
  const isDraft = !document.published;

  return (
    <div className="mx-auto max-w-360 px-4 py-16 sm:px-6 lg:px-25 lg:py-24">
      <p className="text-sm font-medium tracking-[0.2em] text-accent uppercase">
        Legal
      </p>

      <h1 className="mt-4 text-4xl font-bold text-primary lg:text-5xl">
        {document.title}
      </h1>

      {document.effective_date ? (
        <p className="mt-4 text-base text-muted-foreground">
          Effective {formatEffectiveDate(document.effective_date)}
        </p>
      ) : null}

      {/*
        The draft state is stated once, at the top, at full width. CLAUDE.md
        forbids inventing hospital content and this is a legal instrument, so
        the honest empty state is the deliverable until counsel supplies the
        text — see content/legal/README.md.
      */}
      {isDraft ? (
        <PendingNote
          className="mt-8 max-w-[68ch]"
          action={
            <Link
              href={contactHref}
              className="text-sm text-accent underline underline-offset-4 hover:no-underline"
            >
              Contact us with a question
            </Link>
          }
        >
          These terms are with Paelon&rsquo;s legal counsel and are not in force
          yet. The section headings below show what the finished document will
          cover. Nothing on this page is binding until it is published with an
          effective date.
        </PendingNote>
      ) : null}

      <div className="mt-12 grid gap-12 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16">
        <nav
          aria-labelledby="legal-contents"
          className="lg:sticky lg:top-28 lg:self-start"
        >
          <h2
            id="legal-contents"
            className="text-sm font-medium tracking-[0.2em] text-muted-foreground uppercase"
          >
            On this page
          </h2>
          <ol className="mt-4 space-y-1">
            {document.sections.map((section, index) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="flex gap-3 rounded-md py-1.5 text-base text-primary underline-offset-4 hover:underline"
                >
                  {/* Fixed width and right-aligned, so the headings keep a
                      single left edge once the list passes nine and the numbers
                      gain a digit. `tabular-nums` holds the digits themselves
                      to one width. */}
                  <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0">{section.heading}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Measured column: legal prose is read line by line, and a 1440px
            container would otherwise set it at an unreadable measure. */}
        <div className="max-w-[68ch]">
          {document.sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              /* `scroll-mt` clears the sticky header when a jump link lands. */
              className="scroll-mt-28 border-t border-border pt-8 first:border-t-0 first:pt-0 [&+section]:mt-12"
            >
              <h2 className="flex gap-4 text-2xl text-primary">
                <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span className="min-w-0">{section.heading}</span>
              </h2>

              {section.body.length > 0 ? (
                <div className="mt-4 space-y-4">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="text-base text-foreground/80">
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-base text-muted-foreground italic">
                  Awaiting legal review.
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
