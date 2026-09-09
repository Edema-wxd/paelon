import { z } from "zod";

import { isoDate, slug } from "./primitives";

/**
 * Legal document contract (master spec §6: Privacy Policy and Terms).
 *
 * Legal pages are the one content type with no table in the schema and no
 * entry in spec §8's admin CRUD list — spec §6 specifies them as files under
 * `content/`, not CMS rows. This schema describes that file, using the same
 * snake_case-mirrors-the-column convention as `seed.ts` so a Phase 2
 * `legal_pages` table can adopt it unchanged.
 *
 * Bodies are arrays of paragraphs rather than a single blob. A legal document
 * is cited by section, so the section is the unit that has to survive a round
 * trip through an editor.
 */

export const legalSectionSchema = z.object({
  /** Stable anchor. Section links get quoted in correspondence, so it must not
      be derived from the heading, which counsel will reword. */
  id: slug,
  heading: z.string().min(1),
  /** One string per paragraph. Empty means counsel has not supplied it yet. */
  body: z.array(z.string().min(1)).default([]),
});

export const legalDocumentSchema = z
  .object({
    slug,
    title: z.string().min(1),
    /**
     * Defaults to false. A legal page goes live by an explicit edit, never by
     * omission — see the refinement below.
     */
    published: z.boolean().default(false),
    /**
     * True while the bodies are placeholder prose rather than counsel's text.
     *
     * The empty-section guard below cannot catch this on its own: placeholder
     * text is non-empty, so a document full of it would otherwise satisfy every
     * other check and publish cleanly. Clearing this flag is the deliberate act
     * that says a lawyer has read the words.
     */
    placeholder: z.boolean().default(false),
    effective_date: isoDate.nullable().default(null),
    sections: z.array(legalSectionSchema).min(1),
  })
  /*
   * The guards that matter. A document must not be able to go live while it is
   * still a skeleton: without these, flipping one boolean would put a Terms of
   * Service with blank clauses in front of patients and into the search index.
   * `superRefine` rather than `refine` so the message can name the offending
   * sections, which makes the fix obvious from the error alone.
   */
  .superRefine((doc, ctx) => {
    if (!doc.published) return;

    if (doc.placeholder) {
      ctx.addIssue({
        code: "custom",
        path: ["placeholder"],
        message:
          "Cannot publish placeholder text. Replace the bodies with counsel's wording, then set placeholder to false.",
      });
    }

    const empty = doc.sections
      .filter((section) => section.body.length === 0)
      .map((section) => section.id);

    if (empty.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["published"],
        message: `Cannot publish with empty sections: ${empty.join(", ")}`,
      });
    }

    /* An effective date is what makes a legal document citable. */
    if (doc.effective_date === null) {
      ctx.addIssue({
        code: "custom",
        path: ["effective_date"],
        message: "A published legal document needs an effective date.",
      });
    }
  });

export type LegalSection = z.infer<typeof legalSectionSchema>;
export type LegalDocument = z.infer<typeof legalDocumentSchema>;
