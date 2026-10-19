import { z } from "zod";

import { SERVICE_FAMILY_LABELS } from "@/components/booking/types";
import type { Column, Field, ResourceConfig } from "@/lib/admin/resource-config";
import { serviceFamilyEnum, type Service } from "@/lib/db/schema";

import {
  checkboxField,
  idListField,
  imageAltRule,
  imageFields,
  optionalText,
  orderField,
  requiredText,
  slugField,
  tagsField,
  type ImageFieldNames,
} from "./fields";

/**
 * `/admin/services` (spec §8, content type `services` in §5).
 *
 * The first resource whose form writes rows the content table does not hold:
 * `locationIds` and `relatedIds` are `service_locations` and `service_related`,
 * synced by the action after the row is written. They are fields here like any
 * other so that validation, error display and the audit entry all treat them
 * the same way.
 *
 * Nothing in this file describes a service Paelon offers. Every hint is about
 * the control, never about medicine — the copy in these rows is the hospital's
 * to write (CLAUDE.md).
 */

/** `service_locations`: the branches this service is offered at. */
export const SERVICE_LOCATIONS_FIELD = "locationIds";
/** `service_related`: other services shown alongside it. */
export const SERVICE_RELATED_FIELD = "relatedIds";

/** `services.featured_image_id`, with its alt text on the media row. */
export const SERVICE_IMAGE: ImageFieldNames = {
  id: "featuredImageId",
  alt: "featuredImageAlt",
  decorative: "featuredImageDecorative",
};

export const serviceSchema = z
  .object({
    name: requiredText("the service name", 200),
    slug: slugField,
    family: z.enum(serviceFamilyEnum.enumValues, "Choose a family."),
    shortDescription: requiredText("a short description", 200),
    longDescription: requiredText("a long description", 8000),
    whatToExpect: requiredText("what to expect", 8000),
    whoItsFor: tagsField("“who it’s for”"),
    howToAccess: tagsField("“how to access”"),
    typicalWaitTime: optionalText(120),
    [SERVICE_LOCATIONS_FIELD]: idListField("branches"),
    [SERVICE_RELATED_FIELD]: idListField("related services"),
    order: orderField,
    published: checkboxField,
    ...imageFields(SERVICE_IMAGE),
  })
  .check(imageAltRule(SERVICE_IMAGE));

export type ServiceInput = z.output<typeof serviceSchema>;

const FIELDS: readonly Field[] = [
  {
    type: "text",
    name: "name",
    label: "Service name",
    required: true,
    maxLength: 200,
  },
  {
    type: "slug",
    name: "slug",
    label: "Slug",
    from: "name",
    required: true,
    hint: "The last part of /services/… . Generated from the name until you edit it; changing it on a published service breaks every existing link to the page.",
  },
  {
    type: "select",
    name: "family",
    label: "Family",
    required: true,
    options: serviceFamilyEnum.enumValues.map((value) => ({
      value,
      label: SERVICE_FAMILY_LABELS[value],
    })),
  },
  {
    type: "textarea",
    name: "shortDescription",
    label: "Short description",
    required: true,
    rows: 3,
    maxLength: 200,
    hint: "One or two sentences. Used on the services index and in the page’s meta description, so it is capped at 200 characters.",
  },
  {
    type: "markdown",
    name: "longDescription",
    label: "Long description",
    required: true,
    rows: 12,
    hint: "Markdown. Links are written as [text](/path) and must point at pages that exist.",
  },
  {
    type: "markdown",
    name: "whatToExpect",
    label: "What to expect",
    required: true,
    rows: 8,
    hint: "Markdown. What happens on the day, from the patient’s side.",
  },
  {
    type: "tags",
    name: "whoItsFor",
    label: "Who it’s for",
    hint: "One entry per line item. Press Enter after each.",
  },
  {
    type: "tags",
    name: "howToAccess",
    label: "How to access",
    hint: "One entry per step. Press Enter after each.",
  },
  {
    type: "text",
    name: "typicalWaitTime",
    label: "Typical wait time",
    maxLength: 120,
    hint: "Optional. Leave empty unless the hospital has given you a figure — never estimate one.",
  },
  {
    type: "multiselect",
    name: SERVICE_LOCATIONS_FIELD,
    label: "Offered at",
    hint: "The branches this service is available at. Shown on each branch page.",
    emptyLabel: "No branches yet — create one under Locations first.",
  },
  {
    type: "multiselect",
    name: SERVICE_RELATED_FIELD,
    label: "Related services",
    hint: "Shown at the foot of this service’s page. This service is excluded from the list.",
    emptyLabel: "No other services to relate this one to yet.",
  },
  {
    type: "image",
    name: SERVICE_IMAGE.id,
    label: "Featured image",
    altName: SERVICE_IMAGE.alt,
    altLabel: "Featured image alt text",
    hint: "Optional. No template renders a service image yet — the cards and the detail hero use their design-asset slot. Stored for when one does.",
  },
  { type: "number", name: "order", label: "Order", min: 0, max: 9999, hint: "Low numbers first." },
  {
    type: "checkbox",
    name: "published",
    label: "Published",
    hint: "An unpublished service is gone from /services and its own page 404s. Booking still works: /book?service= falls back to step 1 when the slug does not resolve.",
  },
];

const COLUMNS: readonly Column<Service>[] = [
  { label: "Service", sortKey: "name", value: (row) => row.name, primary: true },
  { label: "Family", sortKey: "family", value: (row) => SERVICE_FAMILY_LABELS[row.family] },
  { label: "Order", sortKey: "order", value: (row) => String(row.order) },
  { label: "Status", sortKey: "published", value: (row) => (row.published ? "Published" : "Draft") },
];

export const serviceResource: ResourceConfig<Service, typeof serviceSchema> = {
  name: "services",
  singular: "Service",
  plural: "Services",
  description:
    "What the hospital offers, one page each under /services. Every row is a claim about Paelon’s care — write it from what the hospital has supplied, never from what a service of this name usually involves.",
  emptyMessage: "No services yet. /services renders an empty index until one is published.",
  fields: FIELDS,
  columns: COLUMNS,
  schema: serviceSchema,
  titleField: "name",
  deleteWarning:
    "/services/<slug> is live. Deleting it makes that URL 404 for anyone holding the link, and takes the service off every branch page and out of the booking flow’s service list.",
};
