import { z } from "zod";

/**
 * About-page contract (master spec §6 About).
 *
 * ## Why a file and not a table
 *
 * `/about` is one page of prose with no rows in it. Everything on it that *is*
 * rows — the leadership team and the awards timeline — already has a table
 * (`doctors`, `awards`) and a CRUD screen. What is left is the founding story,
 * the mission, the vision, the value proposition, the motto and the ESG block:
 * six singleton fields that would make an `about` table with exactly one row in
 * it, plus an admin screen to edit that row, plus a migration to add a seventh
 * field. So it follows `content/legal/` instead (spec §8: legal pages stay as
 * JSON and change by PR), and `lib/about.ts` is the seam a Phase 3 table would
 * replace.
 *
 * ## Why every field is nullable
 *
 * None of this copy exists yet. The founding story is about Patricia and
 * Dr. Ngozi Onyia — real people — and the mission, vision and ESG claims are
 * statements the hospital makes about itself. CLAUDE.md forbids inventing any
 * of it, so the file ships with nulls and the template renders only the fields
 * that have been filled in. A null here is a `TODO(seed)` that cannot leak into
 * a rendered page as the words "TODO(seed)".
 *
 * Prose fields are Markdown, rendered through `lib/markdown.ts` and
 * `ArticleBody` like every other long text on the site.
 */

/** Markdown prose, or null when nobody has written it yet. */
const prose = z.string().trim().min(1).nullable().default(null);

export const aboutContentSchema = z
  .object({
    /**
     * Defaults to false. The page goes live by an explicit edit, never by
     * omission — and while it is false the route serves `noindex`, because an
     * About page of empty sections ranking for the hospital's name is worse
     * than one that is not indexed at all.
     */
    published: z.boolean().default(false),
    /**
     * True while the prose is a draft nobody at Paelon has confirmed. Same
     * reason as `content/legal/`: placeholder text is non-empty, so the
     * fill-in guard below cannot catch it on its own.
     */
    placeholder: z.boolean().default(false),
    /** One or two sentences under the `h1`. */
    intro: prose,
    /** Spec §6: "Founding story (Patricia, Dr. Ngozi Onyia)." */
    founding_story: prose,
    mission: prose,
    vision: prose,
    value_proposition: prose,
    /** One line, shown as a pull quote. Not Markdown. */
    motto: z.string().trim().min(1).max(200).nullable().default(null),
    /**
     * Spec §6: "ESG / IFC EDGE certification block". Prose rather than a
     * boolean: "we are EDGE certified" is a verifiable claim about a real
     * certificate, and a flag defaulting either way would be asserting
     * something. If the certification exists, it is described here in words
     * Francis supplies.
     */
    esg: prose,
  })
  .superRefine((about, ctx) => {
    if (!about.published) return;

    if (about.placeholder) {
      ctx.addIssue({
        code: "custom",
        path: ["placeholder"],
        message:
          "Cannot publish placeholder copy. Replace it with Francis's wording, then set placeholder to false.",
      });
    }

    /*
     * The four sections spec §6 names as the substance of the page. The motto
     * and the ESG block are genuinely optional — a hospital may not have either
     * — but an About page with no founding story, mission, vision or value
     * proposition is not an About page.
     */
    const required = [
      "intro",
      "founding_story",
      "mission",
      "vision",
      "value_proposition",
    ] as const;

    const missing = required.filter((field) => about[field] === null);

    if (missing.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["published"],
        message: `Cannot publish with empty sections: ${missing.join(", ")}`,
      });
    }
  });

export type AboutContent = z.infer<typeof aboutContentSchema>;
