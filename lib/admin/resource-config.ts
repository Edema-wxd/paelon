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
  /**
   * The card this field sits in on the editor. Sections appear in the order
   * their first field does; a field without one lands in "Details".
   * `published` and `order` ignore this — they always go to the publishing
   * panel beside the form.
   */
  section?: string;
  /**
   * How much of the section's row the field takes from `sm` up. Short values —
   * a city, a phone number, one of a pair of coordinates — sit side by side
   * instead of each taking a full-width line. Omitted is full width.
   */
  width?: "half" | "third";
}

export type Field =
  | (FieldBase & { type: "text"; maxLength?: number })
  | (FieldBase & { type: "textarea"; rows?: number; maxLength?: number })
  /**
   * Markdown, rendered with a toolbar and a live preview (spec §8).
   *
   * `figures` adds the image picker, for bodies that may contain block images
   * — `blog_posts.body`. Off elsewhere: a service's description renders inside
   * a template that owns its own layout, so an image dropped into it has
   * nowhere sensible to go.
   */
  | (FieldBase & { type: "markdown"; rows?: number; figures?: boolean })
  | (FieldBase & { type: "number"; min?: number; max?: number; step?: number })
  | (FieldBase & { type: "select"; options: readonly FieldOption[] })
  | (FieldBase & { type: "checkbox" })
  | (FieldBase & { type: "url" })
  /**
   * A calendar date, stored as a `date` column and submitted as `YYYY-MM-DD`.
   * `<input type="date">` is the control; the schema is what enforces the
   * format, because the native picker is not available everywhere.
   */
  | (FieldBase & { type: "date"; min?: string; max?: string })
  /**
   * A single foreign key, chosen from a list the editor screen loads. Like
   * `multiselect`, the options are rows rather than config — they are filed
   * under the field's name in `ResourceFormProps.options`. `emptyLabel` is the
   * blank choice, which is a real answer: a testimonial need not name a
   * service, and the column is nullable for that reason.
   */
  | (FieldBase & { type: "reference"; emptyLabel: string })
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
  | (FieldBase & { type: "image"; altName: string; altLabel: string })
  /**
   * A `text[]` column, edited as tags. One value per tag, order preserved,
   * duplicates dropped on save.
   */
  | (FieldBase & { type: "tags"; maxItems?: number; maxLength?: number })
  /**
   * An ordered set of images from the media library.
   *
   * Backed by a join table rather than a column, so it is declared in
   * `./resources/server.ts` under `galleries` as well as here — the field name
   * is what ties the two together, the same way `multiselect` works.
   *
   * Order is the editor's: the control submits one hidden input per image in
   * the arranged sequence, and `syncRelationIn` writes the index into the join
   * row's `order`.
   */
  | (FieldBase & { type: "gallery"; max?: number })
  /**
   * The rows of a join table, chosen from a list the editor screen loads. The
   * options are *not* in the config: they are rows, they change, and a config
   * that is client-safe cannot read them. `name` is the key the screen files
   * them under — see `ResourceFormProps.options`.
   */
  | (FieldBase & { type: "multiselect"; emptyLabel?: string })
  /**
   * The seven-day opening schedule on `locations.hours`, validated against
   * `lib/validation/hours.ts`. Paired with a `hoursConfirmed` checkbox: an
   * unconfirmed schedule is stored as `{}`, never as a guess.
   */
  | (FieldBase & {
      type: "hours";
      /** The companion checkbox. Unticked stores `{}` rather than a guess. */
      confirmedName: string;
    });

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
  /**
   * Extra sentence in the delete confirmation, for a type whose rows have a
   * public URL. A soft delete takes that URL off the site, so the person
   * clicking needs to know a live page is about to start 404ing.
   */
  deleteWarning?: string;
}

/**
 * A type name as it reads mid-sentence: "Service" → "service", but "HMO" and
 * "FAQs" stay as they are. Lowercasing an acronym gives "New hmo" and
 * "Delete this faq", which reads as a typo on every screen that says it.
 */
export function inSentence(noun: string): string {
  const first = noun.split(" ")[0] ?? noun;
  return (first.match(/[A-Z]/g)?.length ?? 0) >= 2 ? noun : noun.toLowerCase();
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
