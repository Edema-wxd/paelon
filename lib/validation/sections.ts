import { z } from "zod";

import { headingSkips, imagePlacementIssues } from "@/lib/markdown";

/**
 * Page sections — the rearrangeable blocks on service pages and the About page
 * (migration 0008, `content_sections`).
 *
 * One schema for both sides of the wire (CLAUDE.md: client for UX, server for
 * truth): the layout editor validates with it before saving, and the save
 * action parses the same JSON with it before anything is written. Client-safe
 * — no server imports — because the editor runs in the browser.
 *
 * The database stores `data` as JSON and trusts this schema to have decided
 * what is valid, as the rest of the content model trusts its Zod schemas.
 */

export const SECTION_KINDS = ["text", "image", "gallery", "cta"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

/** The most blocks one page may hold — a guard, not a design target. */
export const MAX_SECTIONS = 40;

/** Trimmed text where blank means "not given". */
const optionalLine = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .optional()
    .transform((value) => (value ? value : undefined));

const requiredLine = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label.toLowerCase()}.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

const mediaId = z.uuid("Choose an image from the media library.");

/**
 * Where a call-to-action button may go: a page on this site, a phone number,
 * an email address or an https page — the same schemes Markdown links allow.
 * Anything else (`javascript:` above all) is refused, not rendered inert.
 */
const SAFE_HREF = /^(?:\/(?!\/)|tel:|mailto:|https:\/\/)/i;

/**
 * Markdown that will render as written: every figure on a line of its own and
 * no skipped heading level — the rules blog posts publish under. Checked on
 * every save rather than only at publish: a section has no draft state of its
 * own, so whatever is saved is what the live page shows.
 */
const sectionBody = z
  .string()
  .trim()
  .min(1, "Write the text for this block, or remove the block.")
  .max(20000, "This block is too long — split it into two.")
  .superRefine((body, ctx) => {
    if (imagePlacementIssues(body).length > 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "An image has to sit on a line of its own, with a blank line above and below it. Use the Image button to place it.",
      });
      return;
    }
    const skip = headingSkips(body)[0];
    if (skip) {
      ctx.addIssue({
        code: "custom",
        message: `Heading levels cannot skip a step: “${skip.text}” is a level-${skip.level} heading under a level-${skip.after}.`,
      });
    }
  });

export const textSectionData = z.object({
  /** Optional. With one, the block is its own titled section of the page. */
  heading: optionalLine(120, "The heading"),
  body: sectionBody,
});

export const imageSectionData = z.object({
  mediaId,
  caption: optionalLine(300, "The caption"),
});

export const gallerySectionData = z.object({
  /** Required: a gallery is its own region of the page, and needs a name. */
  heading: requiredLine(120, "A heading for the gallery"),
  mediaIds: z
    .array(mediaId)
    .min(1, "Add at least one image to the gallery.")
    .max(24, "A gallery holds at most 24 images."),
});

export const ctaSectionData = z.object({
  heading: requiredLine(120, "A heading"),
  text: optionalLine(300, "The text"),
  buttonLabel: requiredLine(60, "The button label"),
  href: z
    .string()
    .trim()
    .min(1, "Enter where the button goes.")
    .max(500, "That link is too long.")
    .refine((href) => SAFE_HREF.test(href), {
      message: "Use a page on this site (starting with /), tel:, mailto: or an https:// address.",
    }),
});

export const sectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), data: textSectionData }),
  z.object({ kind: z.literal("image"), data: imageSectionData }),
  z.object({ kind: z.literal("gallery"), data: gallerySectionData }),
  z.object({ kind: z.literal("cta"), data: ctaSectionData }),
]);

export const sectionsSchema = z
  .array(sectionSchema)
  .max(MAX_SECTIONS, `A page can hold at most ${MAX_SECTIONS} blocks.`);

export type Section = z.output<typeof sectionSchema>;
export type SectionInput = z.input<typeof sectionSchema>;

/** Every `media` id a list of sections references: figures, images, galleries. */
export function sectionMediaIds(
  sections: readonly Section[],
  collectBodyIds: (body: string) => string[],
): string[] {
  const ids = new Set<string>();
  for (const section of sections) {
    if (section.kind === "text") collectBodyIds(section.data.body).forEach((id) => ids.add(id));
    if (section.kind === "image") ids.add(section.data.mediaId);
    if (section.kind === "gallery") section.data.mediaIds.forEach((id) => ids.add(id));
  }
  return [...ids];
}
