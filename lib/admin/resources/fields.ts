import { z } from "zod";

import { DAYS, type Hours } from "@/lib/validation/hours";

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

/* -------------------------------------------------------------------------- */
/* List fields                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A `text[]` column, submitted as one form entry per value.
 *
 * `FormData` gives a single string when there is one value and nothing at all
 * when there are none, so both are normalised before the array rules run — a
 * field that only validates when it happens to hold two items is a field that
 * fails on the first real submission.
 *
 * Blanks are dropped and duplicates collapse to the first occurrence. Order is
 * the order they were entered, because these lists are rendered in order on the
 * marketing site.
 */
export function tagsField(
  label: string,
  { maxItems = 30, maxLength = 200 }: { maxItems?: number; maxLength?: number } = {},
) {
  return z
    .preprocess(
      (value) => {
        if (value === undefined || value === null) return [];
        const list = Array.isArray(value) ? value : [value];
        return list.map((entry) => String(entry).trim()).filter((entry) => entry !== "");
      },
      z.array(
        z
          .string()
          .max(maxLength, `Each ${label} must be ${maxLength} characters or fewer.`),
      ),
    )
    // Deduplicated before the count, not after: a list of twenty-one entries
    // where two are the same stores twenty, and refusing it would be an error
    // about something that was never going to be saved.
    .transform((values) => [...new Set(values)])
    .refine(
      (values) => values.length <= maxItems,
      `Use ${maxItems} ${label} entries or fewer.`,
    );
}

/**
 * The other side of a join table: a list of row ids.
 *
 * Every id is checked for shape here; that it names a row that still exists is
 * the database's job, through the foreign key — a row deleted between the form
 * rendering and the save is a real race, and the constraint is the only place
 * that can settle it.
 */
export function idListField(label: string) {
  return z
    .preprocess(
      (value) => {
        if (value === undefined || value === null) return [];
        const list = Array.isArray(value) ? value : [value];
        return list.map((entry) => String(entry).trim()).filter((entry) => entry !== "");
      },
      z.array(z.uuid(`Choose ${label} from the list.`)),
    )
    .transform((values) => [...new Set(values)]);
}

/* -------------------------------------------------------------------------- */
/* Numbers and coordinates                                                    */
/* -------------------------------------------------------------------------- */

/**
 * An optional whole number. The empty string means "not known", which is a
 * different fact from zero and is stored as `null` (CLAUDE.md: never invent a
 * figure about Paelon that nobody supplied).
 */
export function optionalIntField(
  label: string,
  { min = 0, max = 120 }: { min?: number; max?: number } = {},
) {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value)))
    .nullable()
    .refine(
      (value) => value === null || (Number.isInteger(value) && value >= min && value <= max),
      `${label} must be a whole number between ${min} and ${max}.`,
    );
}

/**
 * One half of a coordinate pair, kept as a string because the column is
 * `numeric(10,7)` and Drizzle reads and writes those as strings — rounding a
 * branch's position through a float on every save is a slow way to move a
 * hospital.
 */
export function coordinateField(label: string, bound: number) {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .refine(
      (value) =>
        value === null ||
        (/^-?\d{1,3}(\.\d{1,7})?$/.test(value) &&
          Math.abs(Number(value)) <= bound),
      `${label} must be a decimal between -${bound} and ${bound}, to 7 places or fewer.`,
    );
}

/**
 * Latitude and longitude are only meaningful together: `geo` in the branch's
 * `Hospital` JSON-LD needs both, and the page omits the whole property when
 * either is missing. Half a coordinate is silently no coordinate, so it is an
 * error rather than a shrug.
 */
export function coordinatePairRule(latName: string, lngName: string) {
  return (ctx: { value: unknown; issues: z.core.$ZodRawIssue[] }): void => {
    const value = ctx.value as Record<string, unknown>;
    const lat = value[latName];
    const lng = value[lngName];
    if ((lat === null) === (lng === null)) return;

    const missing = lat === null ? latName : lngName;
    ctx.issues.push({
      code: "custom",
      input: value[missing],
      path: [missing],
      message:
        "Enter both latitude and longitude, or neither — the map and the branch’s structured data need the pair.",
    });
  };
}

/* -------------------------------------------------------------------------- */
/* Opening hours                                                              */
/* -------------------------------------------------------------------------- */

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One day of `locations.hours`, as three form controls.
 *
 * `lib/validation/hours.ts` is the shape that reaches the database and the
 * branch's `openingHoursSpecification`; this is the shape a form can submit —
 * a checkbox and two time inputs, any of which may be blank while someone is
 * still typing. Blank is allowed here and refused by `hoursCompletenessRule`
 * once the schedule is marked confirmed, so the editor is not fighting seven
 * required-field errors from the first keystroke.
 */
export const adminDayField = z
  .object({
    closed: checkboxField,
    open: z.string().trim().optional().transform((value) => value ?? ""),
    close: z.string().trim().optional().transform((value) => value ?? ""),
  })
  .check((ctx) => {
    const day = ctx.value;
    if (day.closed) return;

    for (const key of ["open", "close"] as const) {
      const time = day[key];
      if (time !== "" && !TIME_PATTERN.test(time)) {
        ctx.issues.push({
          code: "custom",
          input: time,
          path: [key],
          message: "Times must be HH:mm, 24-hour.",
        });
      }
    }

    if (
      day.open !== "" &&
      day.close !== "" &&
      TIME_PATTERN.test(day.open) &&
      TIME_PATTERN.test(day.close) &&
      day.open >= day.close
    ) {
      ctx.issues.push({
        code: "custom",
        input: day.close,
        path: ["close"],
        message: "Closing time must be after opening time.",
      });
    }
  });

export type AdminDay = z.output<typeof adminDayField>;

/** The seven days, keyed as `DAYS` keys them. */
export const adminHoursField = z.object({
  mon: adminDayField,
  tue: adminDayField,
  wed: adminDayField,
  thu: adminDayField,
  fri: adminDayField,
  sat: adminDayField,
  sun: adminDayField,
});

export type AdminHours = z.output<typeof adminHoursField>;

/**
 * "Confirmed" means all seven days, because that is what every consumer
 * assumes: `hasPublishedHours` only accepts a complete schedule, and a partial
 * one would publish an `openingHoursSpecification` that silently reads as
 * "closed the rest of the week". Publishing wrong hours for a hospital sends
 * someone to a locked gate, so a half-filled schedule is refused rather than
 * padded out.
 */
export function hoursCompletenessRule(hoursName: string, confirmedName: string) {
  return (ctx: { value: unknown; issues: z.core.$ZodRawIssue[] }): void => {
    const value = ctx.value as Record<string, unknown>;
    if (value[confirmedName] !== true) return;

    const hours = (value[hoursName] ?? {}) as Record<string, AdminDay | undefined>;

    for (const day of DAYS) {
      const entry = hours[day];
      if (entry?.closed) continue;
      if (entry && entry.open !== "" && entry.close !== "") continue;

      ctx.issues.push({
        code: "custom",
        input: entry,
        path: [hoursName, day, entry?.open === "" ? "open" : "close"],
        message:
          "Give this day an opening and a closing time, or tick “Closed”. Confirmed hours must cover all seven days.",
      });
    }
  };
}

/**
 * The value written to `locations.hours`.
 *
 * `{}` until the schedule is confirmed — the empty object is in the column's
 * type on purpose, and it is the only honest answer for a branch whose hours
 * nobody has supplied yet.
 */
export function toHoursValue(
  hours: AdminHours,
  confirmed: boolean,
): Hours | Record<string, never> {
  if (!confirmed) return {};

  return Object.fromEntries(
    DAYS.map((day) => {
      const entry = hours[day];
      return [day, entry.closed ? { closed: true } : { open: entry.open, close: entry.close }];
    }),
  ) as Hours;
}

/* -------------------------------------------------------------------------- */
/* Dates and references                                                       */
/* -------------------------------------------------------------------------- */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A required calendar date, kept as the `YYYY-MM-DD` string Drizzle writes to a
 * `date` column.
 *
 * Not a `Date`: parsing to one and back applies the server's timezone to a
 * value that has none, which is how a date given on the 1st is stored as the
 * 31st for half the world.
 *
 * A future date is refused. Every date this validates is a record of something
 * that already happened — the day a patient gave their words — and a testimonial
 * dated next March is a typo, not a fact.
 */
export function pastDateField(label: string) {
  return z
    .string()
    .trim()
    .min(1, `Enter ${label}.`)
    .regex(ISO_DATE_PATTERN, `${label[0]?.toUpperCase()}${label.slice(1)} must be a date.`)
    .refine((value) => !Number.isNaN(Date.parse(value)), "That is not a real date.")
    .refine(
      (value) => value <= new Date().toISOString().slice(0, 10),
      `${label[0]?.toUpperCase()}${label.slice(1)} cannot be in the future.`,
    );
}

/**
 * An optional foreign key, from a `<select>` whose blank option means "none".
 *
 * Shape only. That the id still names a live row is the foreign key's job —
 * the same division `idListField` draws, and for the same reason: a row deleted
 * between the form rendering and the save is a race only the constraint can
 * settle.
 */
export function optionalReferenceField(label: string) {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .refine(
      (value) => value === null || z.uuid().safeParse(value).success,
      `Choose ${label} from the list, or leave it blank.`,
    );
}

/**
 * A required foreign key, from a `<select>` with no blank option.
 *
 * `optionalReferenceField`'s counterpart, for a column that is `notNull` —
 * `blog_posts.author_id` is the case this exists for. The distinction is not
 * cosmetic: a post whose author never resolved would break the `innerJoin`
 * every public blog read is built on, so the row must not be writable without
 * one.
 */
export function requiredReferenceField(label: string) {
  return z
    .string()
    .trim()
    .min(1, `Choose ${label} from the list.`)
    .refine(
      (value) => z.uuid().safeParse(value).success,
      `Choose ${label} from the list.`,
    );
}

/**
 * An optional calendar date. The empty string means "not set", which is a real
 * answer and is stored as `null`.
 *
 * `pastDateField` without the `min(1)`: the same `YYYY-MM-DD` string for the
 * same timezone reason, and the same refusal of a future date.
 * `blog_posts.published_at` is the case — a draft has none, and a post dated
 * next March would sit at the top of `/blog` today, since `livePost()` only
 * checks that the column is not null. Nothing here schedules a publish.
 */
export function optionalPastDateField(label: string) {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .refine(
      (value) => value === null || ISO_DATE_PATTERN.test(value),
      `${label[0]?.toUpperCase()}${label.slice(1)} must be a date.`,
    )
    .refine(
      (value) => value === null || !Number.isNaN(Date.parse(value)),
      "That is not a real date.",
    )
    .refine(
      (value) => value === null || value <= new Date().toISOString().slice(0, 10),
      `${label[0]?.toUpperCase()}${label.slice(1)} cannot be in the future.`,
    );
}

/**
 * `YYYY-MM-DD` → the instant written to a `timestamptz` column.
 *
 * Midnight **UTC**, explicitly. Handing the bare string to Drizzle would let
 * Postgres read it in the server's timezone, so the same post would carry a
 * different publication date depending on which machine saved it — and on
 * Vercel that machine is not the one it was written on.
 */
export function toTimestamp(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00Z`);
}

/** The inverse, for filling a `date` control back in from a stored row. */
export function toDateInput(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value !== "") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return "";
}
