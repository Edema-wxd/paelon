import { z } from "zod";

/**
 * The Zod pieces every content type shares, so "slug must be kebab-case" is
 * written once and every type's error message reads the same.
 *
 * Client *and* server parse with these (CLAUDE.md): the client for the error
 * before a round trip, the server because that is the one that counts.
 */

/** A submitted checkbox is `"on"` or absent; JSON gives a real boolean. */
export const checkboxField = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean()])
  .optional()
  .transform((value) => value === "on" || value === "true" || value === true);

/**
 * `order`, from a text input.
 *
 * Coerced rather than `z.number()`, because `FormData` only ever holds strings.
 * The empty string means "leave it at the bottom", not `NaN`.
 */
export const orderField = z
  .string()
  .trim()
  // `Number("")` is 0, which would be right by accident; spelled out so the
  // empty field means "bottom of the list" on purpose.
  .transform((value) => (value === "" ? 0 : Number(value)))
  .pipe(
    z
      .number("Order must be a whole number.")
      .int("Order must be a whole number.")
      .min(0, "Order cannot be negative.")
      .max(9999, "Order must be 9999 or less."),
  );

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lowercase kebab-case, the shape every public route segment takes (spec §5). */
export const slugField = z
  .string()
  .trim()
  .min(1, "Enter a slug.")
  .max(80, "Slug must be 80 characters or fewer.")
  .regex(
    SLUG_PATTERN,
    "Use lowercase letters, numbers and single hyphens — no spaces.",
  );

/** A required single-line field with a shared "enter something" message. */
export function requiredText(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `Enter ${label}.`)
    .max(max, `${label[0]?.toUpperCase()}${label.slice(1)} must be ${max} characters or fewer.`);
}

/** An optional single-line field. The empty string normalises to `null`. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .transform((value) => (value === "" ? null : value))
    .nullable();
}

/**
 * An optional external link.
 *
 * `http`/`https` only. A `javascript:` or `data:` URL in a CMS field is stored
 * XSS the moment a template renders it as an `href` — the same reason
 * `lib/markdown.ts` degrades unsafe hrefs to text.
 */
export const externalLinkField = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .refine(
    (value) => {
      if (value === null) return true;
      try {
        const { protocol } = new URL(value);
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    "Enter a full link starting with http:// or https://",
  );

/* -------------------------------------------------------------------------- */
/* Image fields                                                               */
/* -------------------------------------------------------------------------- */

/**
 * An image field is three submitted values — the `media.id`, the alt text, and
 * a "decorative" flag — and one rule spanning them: **alt text is required
 * whenever an image is set.** A shipped image without alt text is a blocking
 * accessibility failure, not a nit (CLAUDE.md, spec §12), so the three are
 * validated together rather than as three independent optional fields.
 *
 * Empty alt text is a legitimate answer for a decorative image, so it has to be
 * *chosen* rather than merely left blank — that is what `decorative` records.
 * Blank alt text with `decorative` unticked is the error.
 */
export interface ImageFieldNames {
  /** Holds the `media.id`. */
  id: string;
  alt: string;
  decorative: string;
}

/** The `media.id` half of an image field. */
export const mediaIdField = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .refine(
    (value) => value === null || z.uuid().safeParse(value).success,
    "That image is no longer in the media library.",
  );

/** The alt-text half. Length only — the pair rule is `imageAltRule`. */
export const altTextField = z
  .string()
  .trim()
  .max(300, "Alt text must be 300 characters or fewer.");

/** The three schema entries an image field contributes to a resource schema. */
export function imageFields(names: ImageFieldNames) {
  return {
    [names.id]: mediaIdField,
    [names.alt]: altTextField,
    [names.decorative]: checkboxField,
  };
}

/**
 * The pair rule, applied to the whole object with `.check()`.
 *
 * Pass every image field a resource has. Kept separate from `imageFields`
 * because a cross-field rule cannot live on one of the fields it spans: Zod
 * validates fields in isolation, and attaching it to `alt` alone would not see
 * whether an image is set.
 */
export function imageAltRule(...images: ImageFieldNames[]) {
  return (ctx: { value: unknown; issues: z.core.$ZodRawIssue[] }): void => {
    const value = ctx.value as Record<string, unknown>;

    for (const names of images) {
      const hasImage = value[names.id] != null;
      const alt = String(value[names.alt] ?? "");
      const decorative = value[names.decorative] === true;

      if (hasImage && alt === "" && !decorative) {
        ctx.issues.push({
          code: "custom",
          input: alt,
          path: [names.alt],
          message:
            "Describe the image, or tick “decorative” if it carries no information.",
        });
      }
    }
  };
}
