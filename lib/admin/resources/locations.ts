import { z } from "zod";

import type { Column, Field, ResourceConfig } from "@/lib/admin/resource-config";
import type { Location } from "@/lib/db/schema";

import {
  adminHoursField,
  checkboxField,
  coordinateField,
  coordinatePairRule,
  hoursCompletenessRule,
  optionalText,
  orderField,
  requiredText,
  slugField,
} from "./fields";

/**
 * `/admin/locations` (spec §8, content type `locations` in §5).
 *
 * The branch row is the one piece of content that has to stay valid for
 * something other than a template: `/locations/[slug]` builds its `Hospital`
 * JSON-LD out of these columns, so what the form can save and what the
 * structured data needs are the same list.
 *
 * That is why three rules here are stricter than the database:
 *
 *  - **coordinates come in pairs** — `geo` needs both, and the page drops the
 *    whole property if either is missing, so half a coordinate is silently no
 *    coordinate (`coordinatePairRule`);
 *  - **hours are all seven days or none** — `hasPublishedHours` accepts nothing
 *    less, and a partial schedule would publish an `openingHoursSpecification`
 *    that reads as "closed the rest of the week" (`hoursCompletenessRule`);
 *  - **address, phone and emergency line are required** — they are emitted
 *    unconditionally as `address` and `telephone`, with no omit-if-empty branch
 *    to fall back on.
 *
 * Everything the form can save therefore still validates as structured data,
 * including the empty cases: no coordinates and no hours are both legal, and
 * both come out as an absent property rather than a hollow one.
 */

/** Companion to `hours`: false stores `{}` rather than a guessed schedule. */
export const HOURS_CONFIRMED_FIELD = "hoursConfirmed";

export const locationSchema = z
  .object({
    name: requiredText("the branch name", 200),
    slug: slugField,
    addressLine1: requiredText("the first address line", 300),
    addressLine2: optionalText(300),
    city: requiredText("the city", 120),
    state: requiredText("the state", 120),
    country: requiredText("the country", 120),
    latitude: coordinateField("Latitude", 90),
    longitude: coordinateField("Longitude", 180),
    phone: requiredText("a phone number", 60),
    whatsapp: optionalText(60),
    emergencyLine: requiredText("an emergency line", 60),
    hours: adminHoursField,
    [HOURS_CONFIRMED_FIELD]: checkboxField,
    parkingInfo: optionalText(2000),
    accessibilityNotes: optionalText(2000),
    bookingEmail: optionalText(200).refine(
      (value) => value === null || z.email().safeParse(value).success,
      "Enter a valid email address, or leave it empty to fall back to the branch address in the environment.",
    ),
    order: orderField,
    published: checkboxField,
  })
  .check(coordinatePairRule("latitude", "longitude"))
  .check(hoursCompletenessRule("hours", HOURS_CONFIRMED_FIELD));

export type LocationInput = z.output<typeof locationSchema>;

const FIELDS: readonly Field[] = [
  { type: "text", name: "name", label: "Branch name", required: true, maxLength: 200 },
  {
    type: "slug",
    name: "slug",
    label: "Slug",
    from: "name",
    required: true,
    hint: "The last part of /locations/… . It is also the key /book?branch= matches, and the key the BRANCH_*_EMAIL fallback is looked up by.",
  },
  { type: "text", name: "addressLine1", label: "Address line 1", required: true, maxLength: 300 },
  { type: "text", name: "addressLine2", label: "Address line 2", maxLength: 300 },
  { type: "text", name: "city", label: "City", required: true, maxLength: 120 },
  { type: "text", name: "state", label: "State", required: true, maxLength: 120 },
  { type: "text", name: "country", label: "Country", required: true, maxLength: 120 },
  {
    type: "text",
    name: "latitude",
    label: "Latitude",
    hint: "Decimal degrees, up to 7 places. Drives the map, the “Get directions” link and the branch’s geo data — fill both coordinates or neither.",
  },
  { type: "text", name: "longitude", label: "Longitude", hint: "Decimal degrees, up to 7 places." },
  { type: "text", name: "phone", label: "Phone", required: true, maxLength: 60 },
  { type: "text", name: "whatsapp", label: "WhatsApp", maxLength: 60 },
  {
    type: "text",
    name: "emergencyLine",
    label: "Emergency line",
    required: true,
    maxLength: 60,
    hint: "Shown on the branch page and on the error pages. It has to be a number someone will answer.",
  },
  {
    type: "checkbox",
    name: HOURS_CONFIRMED_FIELD,
    label: "Opening hours confirmed",
    hint: "Leave this unticked until the hospital has given you the schedule. While it is unticked nothing below is saved and the page shows that hours are still to come, which is better than publishing a guess.",
  },
  {
    type: "hours",
    name: "hours",
    confirmedName: HOURS_CONFIRMED_FIELD,
    label: "Opening hours",
    hint: "24-hour times. A branch open around the clock is 00:00 to 23:59.",
  },
  {
    type: "textarea",
    name: "parkingInfo",
    label: "Parking",
    rows: 3,
    maxLength: 2000,
    hint: "Optional.",
  },
  {
    type: "textarea",
    name: "accessibilityNotes",
    label: "Accessibility notes",
    rows: 3,
    maxLength: 2000,
    hint: "Optional. Step-free access, lifts, accessible toilets — only what has been confirmed on site.",
  },
  {
    type: "text",
    name: "bookingEmail",
    label: "Booking inbox",
    maxLength: 200,
    hint: "Optional. Where this branch’s bookings are emailed. Empty falls back to the BRANCH_*_EMAIL variable for this slug.",
  },
  { type: "number", name: "order", label: "Order", min: 0, max: 9999, hint: "Low numbers first." },
  {
    type: "checkbox",
    name: "published",
    label: "Published",
    hint: "An unpublished branch is gone from /locations, from the booking flow’s branch list and from every service and HMO page that lists it.",
  },
];

const COLUMNS: readonly Column<Location>[] = [
  { label: "Branch", sortKey: "name", value: (row) => row.name, primary: true },
  { label: "City", sortKey: "city", value: (row) => row.city },
  { label: "Order", sortKey: "order", value: (row) => String(row.order) },
  { label: "Status", sortKey: "published", value: (row) => (row.published ? "Published" : "Draft") },
];

export const locationResource: ResourceConfig<Location, typeof locationSchema> = {
  name: "locations",
  singular: "Location",
  plural: "Locations",
  description:
    "The branches. These rows are the address, the phone number and the opening hours a patient will travel on, and they are what the branch page publishes as structured data — an approximation here is a wasted journey.",
  emptyMessage:
    "No branches yet. The booking flow cannot run without at least one published branch.",
  fields: FIELDS,
  columns: COLUMNS,
  schema: locationSchema,
  titleField: "name",
  deleteWarning:
    "/locations/<slug> is live. Deleting it makes that URL 404, removes the branch from the booking flow, and takes it off every service, doctor and HMO that lists it.",
};
