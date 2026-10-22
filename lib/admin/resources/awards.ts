import { z } from "zod";

import type { Column, Field, ResourceConfig } from "@/lib/admin/resource-config";
import type { Award } from "@/lib/db/schema";

import {
  checkboxField,
  externalLinkField,
  imageAltRule,
  imageFields,
  orderField,
  requiredText,
  slugField,
  type ImageFieldNames,
} from "./fields";

/**
 * `/admin/awards` (spec §8, content type `awards` in §5).
 *
 * The second proof of the CRUD kit, and the one that exercises the image
 * field: an award has two of them, a logo and a certificate scan, each with
 * its own alt text on its own `media` row.
 *
 * Nothing here may be written on Paelon's behalf. An award is a factual claim
 * about a hospital — CLAUDE.md forbids inventing one, and there is no seed file
 * for this type, so every row is one somebody typed from a real certificate.
 */

export const AWARD_LOGO: ImageFieldNames = {
  id: "logoId",
  alt: "logoAlt",
  decorative: "logoDecorative",
};

export const AWARD_CERTIFICATE: ImageFieldNames = {
  id: "certificateImageId",
  alt: "certificateImageAlt",
  decorative: "certificateImageDecorative",
};

/** 1900 to next year: an award can be announced slightly ahead of its date. */
const MIN_YEAR = 1900;
const MAX_YEAR = new Date().getUTCFullYear() + 1;

export const awardSchema = z
  .object({
    name: requiredText("the award name", 200),
    awardingBody: requiredText("the awarding body", 200),
    year: z
      .string()
      .trim()
      .min(1, "Enter the year.")
      .transform((value) => Number(value))
      .pipe(
        z
          .number("Year must be a four-digit year.")
          .int("Year must be a four-digit year.")
          .min(MIN_YEAR, `Year must be ${MIN_YEAR} or later.`)
          .max(MAX_YEAR, `Year cannot be later than ${MAX_YEAR}.`),
      ),
    description: requiredText("a description", 2000),
    externalLink: externalLinkField,
    slug: slugField,
    order: orderField,
    published: checkboxField,
    ...imageFields(AWARD_LOGO),
    ...imageFields(AWARD_CERTIFICATE),
  })
  .check(imageAltRule(AWARD_LOGO, AWARD_CERTIFICATE));

export type AwardInput = z.output<typeof awardSchema>;

const FIELDS: readonly Field[] = [
  {
    type: "text",
    name: "name",
    label: "Award name",
    required: true,
    maxLength: 200,
    hint: "Exactly as it appears on the certificate.",
  },
  {
    type: "slug",
    name: "slug",
    label: "Slug",
    from: "name",
    required: true,
    hint: "Generated from the award name until you edit it.",
  },
  {
    type: "text",
    name: "awardingBody",
    label: "Awarded by",
    required: true,
    maxLength: 200,
  },
  { type: "number", name: "year", label: "Year", required: true, min: MIN_YEAR, max: MAX_YEAR },
  {
    type: "markdown",
    name: "description",
    label: "Description",
    required: true,
    rows: 6,
    hint: "What the award recognises. Markdown.",
  },
  {
    type: "url",
    name: "externalLink",
    label: "Link",
    hint: "Optional. The awarding body’s announcement page.",
  },
  {
    type: "image",
    name: AWARD_LOGO.id,
    label: "Logo",
    altName: AWARD_LOGO.alt,
    altLabel: "Logo alt text",
    hint: "The awarding body’s logo.",
  },
  {
    type: "image",
    name: AWARD_CERTIFICATE.id,
    label: "Certificate",
    altName: AWARD_CERTIFICATE.alt,
    altLabel: "Certificate alt text",
    hint: "Optional. A photograph or scan of the certificate.",
  },
  { type: "number", name: "order", label: "Order", min: 0, max: 9999, hint: "Low numbers first." },
  { type: "checkbox", name: "published", label: "Published" },
];

const COLUMNS: readonly Column<Award>[] = [
  { label: "Award", sortKey: "name", value: (row) => row.name, primary: true },
  { label: "Awarded by", sortKey: "awardingBody", value: (row) => row.awardingBody },
  { label: "Year", sortKey: "year", value: (row) => String(row.year) },
  { label: "Status", sortKey: "published", value: (row) => (row.published ? "Published" : "Draft") },
];

export const awardResource: ResourceConfig<Award, typeof awardSchema> = {
  name: "awards",
  singular: "Award",
  plural: "Awards",
  description:
    "Recognition Paelon has received. Every row is a factual claim about the hospital — add one only from a certificate or an announcement you have in front of you.",
  emptyMessage: "No awards yet.",
  fields: FIELDS,
  columns: COLUMNS,
  schema: awardSchema,
  titleField: "name",
};
