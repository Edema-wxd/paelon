import type { z } from "zod";

/**
 * The per-type description a CRUD screen is built from (spec §8 Content editing).
 *
 * ## Why a config object and not a form builder
 *
 * Every content type in §8 needs the same eleven things: a list with a status
 * filter, a new form, an edit form, a slug generated from the title, a
 * draft/published toggle, an order field, a soft delete, alt text on every
 * image, a uniqueness error on the slug, an audit row, and a cache tag. Written
 * per type that is eleven chances to get one of them wrong, times ten types.
 *
 * So the *fields* are data and the *screens* are one component each. What this
 * is not is a form builder: there is no expression language, no conditional
 * visibility, no layout engine. A field that needs behaviour this cannot
 * express gets a real component and a `custom` entry, which is the escape
 * hatch that keeps the rest of the config honest.
 *
 * ## Why this module is client-safe
 *
 * `resource-form.tsx` is a client component and needs the field list and the
 * Zod schema for client-side validation. So this module imports no database,
 * no Drizzle table and no server code — only Zod. The server half of a
 * resource (its table, its cache tags, its repository) lives in
 * `lib/admin/resources/server.ts`, which the form never touches.
 *
 * Configs cross the RSC boundary as a *name*, never as an object: a Zod schema
 * is not serialisable, so a page passes `resource="faqs"` and the client looks
 * the config up in `lib/admin/resources/index.ts`.
 */

/** A `<select>` / radio option. */
export interface FieldOption {
  value: string;
  label: string;
}

interface FieldBase {
  name: string;
  /** The visible `<label>`. Never a placeholder — spec §12. */
  label: string;
  /** Rendered as help text under the control, and announced with it. */
  hint?: string;
  /** Marks the control `required` and shows the required hint. */
  required?: boolean;
}

export type Field =
  | (FieldBase & { type: "text"; maxLength?: number })
  | (FieldBase & { type: "textarea"; rows?: number; maxLength?: number })
  /** Markdown, rendered with a toolbar and a live preview (spec §8). */
  | (FieldBase & { type: "markdown"; rows?: number })
  | (FieldBase & { type: "number"; min?: number; max?: number; step?: number })
  | (FieldBase & { type: "select"; options: readonly FieldOption[] })
  | (FieldBase & { type: "checkbox" })
  | (FieldBase & { type: "url" })
  /**
   * Generated from `from` until the editor types in it, then left alone
   * (spec §8: "Slug auto-generated from title, editable").
   */
  | (FieldBase & { type: "slug"; from: string })
  /**
   * An UploadThing image plus the alt text for it. `name` holds the `media.id`;
   * `altName` is the alt text, submitted alongside and written to the media
   * row. Alt text is required whenever the image is set — never independently
   * optional.
   */
  | (FieldBase & { type: "image"; altName: string; altLabel: string });

/** A list-view column. `render` is server-side, so it may be a formatter. */
export interface Column<R> {
  /** Heading text. */
  label: string;
  /** The row key, when the column is sortable through the URL. */
  sortKey?: string;
  /** Cell content. Returning a string keeps the table a server component. */
  value: (row: R) => string;
  /** The first column links to the detail view. */
  primary?: boolean;
}

/**
 * Everything a CRUD screen needs that does not touch the database.
 *
 * `schema` validates a submission on both sides of the wire: the client for the
 * error message you get before a round trip, the server for the one that is
 * true (CLAUDE.md). It is the same schema, so they cannot drift.
 */
export interface ResourceConfig<R, S extends z.ZodType = z.ZodType> {
  /** URL segment and registry key: `/admin/faqs` → `faqs`. */
  name: string;
  /** "FAQ" — used in headings and in every message about one row. */
  singular: string;
  /** "FAQs". */
  plural: string;
  /** One sentence under the list heading. */
  description: string;
  /** Empty-state copy, shown when nothing has been created yet. */
  emptyMessage: string;
  fields: readonly Field[];
  columns: readonly Column<R>[];
  schema: S;
  /** Field to generate the slug from, and the one a list search matches. */
  titleField: string;
}

/** `/admin/faqs` and friends. */
export function resourceHref(name: string, suffix = ""): string {
  return `/admin/${name}${suffix}`;
}

/**
 * Title → slug: lowercase, ASCII, kebab-case.
 *
 * Deliberately lossy on anything that is not `[a-z0-9-]`. A slug is a URL
 * segment, and a transliteration table for characters Paelon's content does
 * not use would be guesswork. The editor can always type the slug themselves,
 * which is why the field stays editable.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    // Strip combining marks, so "Ẹkó" becomes "Eko" rather than losing the letter.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
