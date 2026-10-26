import { z } from "zod";

import { checkboxField, markdownBodyRules } from "@/lib/admin/resources/fields";

/**
 * About-page contract (master spec §6 About).
 *
 * ## Where the copy lives
 *
 * In Postgres, as the `about_content` singleton (migration 0005). It was a
 * file — `content/about.json` — on the grounds that a one-row table plus a
 * screen to edit that one row bought nothing. It buys the thing that turned
 * out to matter: Paelon writing the founding story without a deploy. The
 * shape below did not change in the move, which is why no template did either.
 *
 * `aboutContentSchema` is the rendered contract; `aboutFormSchema` is the same
 * rules applied to what `/admin/about` submits, where every field arrives as a
 * string and an empty one means "cleared".
 *
 * Legal pages did not follow: decision C3 keeps /privacy and /terms as files
 * that change by PR after counsel review.
 *
 * ## Why every field is nullable
 *
 * None of this copy exists yet. The founding story is about Patricia and
 * Dr. Ngozi Onyia — real people — and the mission, vision and ESG claims are
 * statements the hospital makes about itself. CLAUDE.md forbids inventing any
 * of it, so the row ships with nulls and the template renders only the fields
 * someone at Paelon has filled in. A null here is a `TODO(seed)` that cannot
 * leak into a rendered page as the words "TODO(seed)".
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
  .superRefine(checkPublishable);

/**
 * The publish guard, shared by the rendered contract and the admin form.
 *
 * Both have to apply it or the two disagree about what "published" costs, and
 * the one that matters is whichever ran last.
 */
function checkPublishable(
  about: {
    published: boolean;
    placeholder: boolean;
    intro: string | null;
    founding_story: string | null;
    mission: string | null;
    vision: string | null;
    value_proposition: string | null;
  },
  ctx: z.RefinementCtx,
): void {
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
}

export type AboutContent = z.infer<typeof aboutContentSchema>;

/* -------------------------------------------------------------------------- */
/* Admin form                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One prose field as `/admin/about` submits it.
 *
 * Trimmed, and the empty string becomes null — clearing a textarea is how an
 * editor removes a section, and storing "" instead would make the template
 * render an empty heading rather than skip the section.
 */
const proseField = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value));

/** `motto` is one line, and the database CHECK caps it at 200 characters. */
const mottoField = z
  .string()
  .trim()
  .max(200, "Keep the motto to 200 characters or fewer.")
  .transform((value) => (value === "" ? null : value));

/**
 * `/admin/about` input.
 *
 * Mirrors `aboutContentSchema` field for field, with the string handling a
 * form needs and the same publish guard — an editor cannot publish a page with
 * empty sections, or one still marked as placeholder copy, whichever side of
 * the wire the check runs on.
 */
export const aboutFormSchema = z
  .object({
    published: checkboxField,
    placeholder: checkboxField,
    intro: proseField,
    founding_story: proseField,
    mission: proseField,
    vision: proseField,
    value_proposition: proseField,
    motto: mottoField,
    esg: proseField,
  })
  .superRefine(checkPublishable)
  // Images on their own line and no skipped heading levels, as for blog posts
  // and services — checked when publishing.
  .check(
    markdownBodyRules(["intro", "founding_story", "mission", "vision", "value_proposition", "esg"]),
  );

export type AboutFormInput = z.output<typeof aboutFormSchema>;
