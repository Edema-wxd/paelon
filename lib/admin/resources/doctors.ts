import { z } from "zod";

import type { Column, Field, ResourceConfig } from "@/lib/admin/resource-config";
import type { Doctor } from "@/lib/db/schema";

import {
  checkboxField,
  idListField,
  imageAltRule,
  imageFields,
  optionalIntField,
  orderField,
  requiredText,
  slugField,
  tagsField,
  type ImageFieldNames,
} from "./fields";

/**
 * `/admin/doctors` (spec §8, content type `doctors` in §5).
 *
 * A doctor row is a set of factual claims about a named person — their
 * qualifications, their years in practice, where they practise. None of it may
 * be filled in from what is plausible for the title: `yearsExperience` is
 * nullable in the schema for exactly that reason and stays empty until somebody
 * supplies the number.
 *
 * `locationIds` is `doctor_locations`, synced by the action after the row is
 * written.
 */

/** `doctor_locations`: the branches this doctor practises at. */
export const DOCTOR_LOCATIONS_FIELD = "locationIds";

/** `doctors.headshot_id`, with its alt text on the media row. */
export const DOCTOR_HEADSHOT: ImageFieldNames = {
  id: "headshotId",
  alt: "headshotAlt",
  decorative: "headshotDecorative",
};

export const doctorSchema = z
  .object({
    name: requiredText("the doctor’s name", 200),
    slug: slugField,
    title: requiredText("a title", 200),
    qualifications: tagsField("qualification"),
    specialties: tagsField("specialty"),
    languagesSpoken: tagsField("language"),
    yearsExperience: optionalIntField("Years of experience", { min: 0, max: 80 }),
    bio: requiredText("a biography", 8000),
    inHouse: checkboxField,
    visiting: checkboxField,
    [DOCTOR_LOCATIONS_FIELD]: idListField("branches"),
    order: orderField,
    published: checkboxField,
    ...imageFields(DOCTOR_HEADSHOT),
  })
  .check(imageAltRule(DOCTOR_HEADSHOT));

export type DoctorInput = z.output<typeof doctorSchema>;

const FIELDS: readonly Field[] = [
  { type: "text", name: "name", label: "Name", required: true, maxLength: 200 },
  {
    type: "slug",
    name: "slug",
    label: "Slug",
    from: "name",
    required: true,
    hint: "Generated from the name until you edit it.",
  },
  {
    type: "text",
    name: "title",
    label: "Title",
    required: true,
    maxLength: 200,
    hint: "The role as the hospital states it.",
  },
  {
    type: "tags",
    name: "qualifications",
    label: "Qualifications",
    hint: "One per entry, exactly as awarded. Press Enter after each.",
  },
  {
    type: "tags",
    name: "specialties",
    label: "Specialties",
    hint: "One per entry. Press Enter after each.",
  },
  {
    type: "tags",
    name: "languagesSpoken",
    label: "Languages spoken",
    hint: "One per entry. Press Enter after each.",
  },
  {
    type: "number",
    name: "yearsExperience",
    label: "Years of experience",
    min: 0,
    max: 80,
    hint: "Optional. Leave empty unless you have been given the figure.",
  },
  {
    type: "markdown",
    name: "bio",
    label: "Biography",
    required: true,
    rows: 12,
    hint: "Markdown. Links are written as [text](/path) and must point at pages that exist.",
  },
  {
    type: "multiselect",
    name: DOCTOR_LOCATIONS_FIELD,
    label: "Practises at",
    hint: "The branches this doctor sees patients at.",
    emptyLabel: "No branches yet — create one under Locations first.",
  },
  { type: "checkbox", name: "inHouse", label: "In-house" },
  { type: "checkbox", name: "visiting", label: "Visiting consultant" },
  {
    type: "image",
    name: DOCTOR_HEADSHOT.id,
    label: "Headshot",
    altName: DOCTOR_HEADSHOT.alt,
    altLabel: "Headshot alt text",
    hint: "Optional. The profile page uses its portrait design-asset slot today; this is stored for when a clinician photograph is delivered.",
  },
  { type: "number", name: "order", label: "Order", min: 0, max: 9999, hint: "Low numbers first." },
  { type: "checkbox", name: "published", label: "Published" },
];

const COLUMNS: readonly Column<Doctor>[] = [
  { label: "Name", sortKey: "name", value: (row) => row.name, primary: true },
  { label: "Title", sortKey: "title", value: (row) => row.title },
  { label: "Order", sortKey: "order", value: (row) => String(row.order) },
  { label: "Status", sortKey: "published", value: (row) => (row.published ? "Published" : "Draft") },
];

export const doctorResource: ResourceConfig<Doctor, typeof doctorSchema> = {
  name: "doctors",
  singular: "Doctor",
  plural: "Doctors",
  description:
    "The clinical team. Every field is a statement about a real named person — fill it in from what the hospital has supplied and leave the rest empty.",
  emptyMessage: "No doctors yet.",
  fields: FIELDS,
  columns: COLUMNS,
  schema: doctorSchema,
  titleField: "name",
  deleteWarning:
    "This doctor’s profile is live. Deleting it makes its URL 404 for anyone holding the link and removes them from every branch page they appear on.",
};
