import { z } from "zod";

import type { Column, Field, ResourceConfig } from "@/lib/admin/resource-config";
import { nameFormatEnum, type Testimonial } from "@/lib/db/schema";

import {
  checkboxField,
  imageAltRule,
  imageFields,
  optionalReferenceField,
  orderField,
  pastDateField,
  requiredText,
  slugField,
  type ImageFieldNames,
} from "./fields";

/**
 * `/admin/testimonials` (spec §8, content type `testimonials` in §5).
 *
 * Every row here is a real patient's words plus a compliance record about a
 * real person, which makes this the one content type where the editor's job is
 * mostly *not* to write. Three things follow from that, and they are the whole
 * reason this config is not another copy of `awards.ts`:
 *
 *  1. **The quote is transcription, not copy.** The hint says so beside the
 *     box, and it is a plain `textarea` rather than the Markdown editor the
 *     other long fields use — a toolbar is an invitation to shape someone
 *     else's sentence, and CLAUDE.md forbids writing, extending or tidying a
 *     patient quote.
 *  2. **Consent is its own control.** `consentGiven` is a checkbox of its own,
 *     defaulting to false, and nothing anywhere sets it as a side effect of
 *     publishing or featuring. A row may be published without it — it simply
 *     will not render, because `lib/db/queries/testimonials.ts` filters public
 *     reads on consent. That separation is deliberate: publishing is an
 *     editorial decision and consent is a recorded fact about a patient, and
 *     one must never be able to imply the other.
 *  3. **Changes to either are audited with before and after.** See `auditDiff`
 *     on the testimonials entry in `./server.ts`. The quote's before and after
 *     are the words themselves (D4, 2026-10-23) — the one place the audit log
 *     deliberately holds personal data, and `lib/admin/audit.ts` says what
 *     follows from that.
 *
 * `name_format` is required for the same reason: how much of a patient's name
 * may appear is part of what they consented to, so it is answered explicitly
 * rather than inherited from the column default.
 */

/** Form field names the server config also needs. */
export const TESTIMONIAL_SERVICE_FIELD = "serviceId";
export const TESTIMONIAL_LOCATION_FIELD = "locationId";

const NAME_FORMAT_LABELS: Record<
  (typeof nameFormatEnum.enumValues)[number],
  string
> = {
  full: "Full name — “Sarah Adenuga”",
  first_only: "First name only — “Sarah”",
  initials: "Initials only — “S.A.”",
};

/** `testimonials.avatar_id`, with its alt text on the media row. */
export const TESTIMONIAL_AVATAR: ImageFieldNames = {
  id: "avatarId",
  alt: "avatarAlt",
  decorative: "avatarDecorative",
};

export const testimonialSchema = z
  .object({
    patientName: requiredText("the patient’s name", 200),
    slug: slugField,
    // `z.enum` over the database enum, so adding a name format to the column is
    // the only place it has to be added.
    nameFormat: z.enum(
      nameFormatEnum.enumValues,
      "Choose how much of the patient’s name may be shown.",
    ),
    quote: requiredText("the quote", 2000),
    dateGiven: pastDateField("the date the quote was given"),
    [TESTIMONIAL_SERVICE_FIELD]: optionalReferenceField("a service"),
    [TESTIMONIAL_LOCATION_FIELD]: optionalReferenceField("a branch"),
    consentGiven: checkboxField,
    featured: checkboxField,
    order: orderField,
    published: checkboxField,
    ...imageFields(TESTIMONIAL_AVATAR),
  })
  .check(imageAltRule(TESTIMONIAL_AVATAR));

export type TestimonialInput = z.output<typeof testimonialSchema>;

const FIELDS: readonly Field[] = [
  {
    type: "text",
    name: "patientName",
    label: "Patient name",
    required: true,
    maxLength: 200,
    section: "Patient and consent",
    hint: "The full name as the patient gave it. It is never shown as typed — “Name shown as” decides how much of it appears.",
  },
  {
    type: "select",
    name: "nameFormat",
    label: "Name shown as",
    required: true,
    section: "Patient and consent",
    width: "half",
    options: nameFormatEnum.enumValues.map((value) => ({
      value,
      label: NAME_FORMAT_LABELS[value],
    })),
    hint: "Must match what the patient agreed to. If you are not sure, choose initials. “Where it appears” shows the exact result.",
  },
  {
    type: "date",
    name: "dateGiven",
    label: "Date given",
    required: true,
    section: "Patient and consent",
    width: "half",
    hint: "The day the patient gave these words.",
  },
  {
    type: "checkbox",
    name: "consentGiven",
    label: "Consent recorded",
    section: "Patient and consent",
    hint: "Tick only when you have a record of this patient agreeing to their words being published, under the name shown above. Without it the quote stays invisible on the site, whatever else is set here.",
  },
  {
    type: "textarea",
    name: "quote",
    label: "Quote",
    required: true,
    rows: 8,
    maxLength: 2000,
    section: "Quote",
    hint: "Enter exactly as the patient gave it. Do not edit their wording.",
  },
  {
    type: "checkbox",
    name: "featured",
    label: "Feature on the homepage",
    section: "Quote",
    hint: "The homepage shows the first two featured quotes by order that are also published and consented.",
  },
  {
    type: "reference",
    name: TESTIMONIAL_SERVICE_FIELD,
    label: "Service",
    section: "Context",
    width: "half",
    emptyLabel: "Not attached to a service",
    hint: "Optional. Stored for when service pages show testimonials — none do yet.",
  },
  {
    type: "reference",
    name: TESTIMONIAL_LOCATION_FIELD,
    label: "Branch",
    section: "Context",
    width: "half",
    emptyLabel: "Not attached to a branch",
    hint: "Optional. Where the care was given. Not shown on the site yet.",
  },
  {
    type: "image",
    name: TESTIMONIAL_AVATAR.id,
    label: "Patient photograph",
    altName: TESTIMONIAL_AVATAR.alt,
    altLabel: "Photograph alt text",
    section: "Context",
    hint: "Optional, and only with the patient’s consent — the same consent the quote itself needs. Not shown on the site yet.",
  },
  {
    type: "slug",
    name: "slug",
    label: "Reference",
    from: "patientName",
    required: true,
    section: "Context",
    hint: "Internal reference, generated from the name. Testimonials have no page of their own.",
  },
  { type: "number", name: "order", label: "Order", min: 0, max: 9999, hint: "Low numbers first. Decides which featured quotes make the homepage’s two." },
  {
    type: "checkbox",
    name: "published",
    label: "Published",
    hint: "A draft never appears. Published is not enough on its own — consent must be recorded too.",
  },
];

const COLUMNS: readonly Column<Testimonial>[] = [
  { label: "Patient", sortKey: "patientName", value: (row) => row.patientName, primary: true },
  {
    label: "Consent",
    sortKey: "consentGiven",
    // Spelled out rather than a tick, because colour and a glyph are not enough
    // on their own for the one column here that decides what the public sees.
    value: (row) => (row.consentGiven ? "Recorded" : "Not recorded"),
  },
  { label: "Featured", sortKey: "featured", value: (row) => (row.featured ? "Yes" : "No") },
  { label: "Status", sortKey: "published", value: (row) => (row.published ? "Published" : "Draft") },
];

export const testimonialResource: ResourceConfig<Testimonial, typeof testimonialSchema> = {
  name: "testimonials",
  singular: "Testimonial",
  plural: "Testimonials",
  description:
    "Real patient words, with the consent record that decides whether they may be shown. Never write, extend or tidy a quote — enter it as it was given, or leave the row alone.",
  emptyMessage: "No testimonials yet.",
  fields: FIELDS,
  columns: COLUMNS,
  schema: testimonialSchema,
  titleField: "patientName",
  deleteWarning:
    "The quote comes off the homepage and off any service page it is attached to as soon as this is saved.",
};
