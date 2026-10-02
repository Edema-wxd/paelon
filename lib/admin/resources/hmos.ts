import { z } from "zod";

import type { Column, Field, ResourceConfig } from "@/lib/admin/resource-config";
import type { Hmo } from "@/lib/db/schema";

import {
  checkboxField,
  idListField,
  optionalText,
  orderField,
  requiredText,
  slugField,
  tagsField,
} from "./fields";

/**
 * `/admin/hmos` (spec §8, content type `hmos` in §5).
 *
 * Aliases are the reason this screen matters more than its size suggests. The
 * `/hmo-check` typeahead searches `name` and `aliases` together
 * (`searchHmos`), so an insurer a patient knows by an abbreviation is only
 * findable if somebody has typed that abbreviation in here. Every alias added
 * is immediately searchable: the action revalidates `CACHE_TAGS.hmos`, and the
 * search route reads through `hmo_aliases_text(aliases)` on each request rather
 * than from a precomputed column.
 *
 * Coverage is a contractual fact between Paelon and an insurer. Nothing in here
 * is written from what an HMO usually covers.
 */

/** `hmo_locations`: the branches that accept this HMO. */
export const HMO_LOCATIONS_FIELD = "locationIds";

export const hmoSchema = z.object({
  name: requiredText("the HMO name", 200),
  slug: slugField,
  aliases: tagsField("alias", { maxItems: 20, maxLength: 120 }),
  coverageNotes: optionalText(4000),
  copayApplies: checkboxField,
  planNotes: optionalText(4000),
  [HMO_LOCATIONS_FIELD]: idListField("branches"),
  order: orderField,
  published: checkboxField,
});

export type HmoInput = z.output<typeof hmoSchema>;

const FIELDS: readonly Field[] = [
  {
    type: "text",
    name: "name",
    label: "HMO name",
    required: true,
    maxLength: 200,
    hint: "The insurer’s own name for itself.",
  },
  {
    type: "slug",
    name: "slug",
    label: "Slug",
    from: "name",
    required: true,
    hint: "Generated from the name until you edit it.",
  },
  {
    type: "tags",
    name: "aliases",
    label: "Also known as",
    maxItems: 20,
    maxLength: 120,
    hint: "Every other name a patient might type into the HMO check — abbreviations, former names, the name on the card. Press Enter after each. Searchable as soon as you save.",
  },
  {
    type: "textarea",
    name: "coverageNotes",
    label: "Coverage notes",
    rows: 5,
    maxLength: 4000,
    hint: "Optional. What this HMO covers at Paelon, from the agreement — never from what the plan usually covers.",
  },
  {
    type: "checkbox",
    name: "copayApplies",
    label: "Co-pay applies",
    hint: "Shown on the HMO check result, so tick it only when the agreement says so.",
  },
  {
    type: "textarea",
    name: "planNotes",
    label: "Plan notes",
    rows: 5,
    maxLength: 4000,
    hint: "Optional. Which plans or tiers this applies to.",
  },
  {
    type: "multiselect",
    name: HMO_LOCATIONS_FIELD,
    label: "Accepted at",
    hint: "The branches that accept this HMO. The typeahead lists these under each result.",
    emptyLabel: "No branches yet — create one under Locations first.",
  },
  { type: "number", name: "order", label: "Order", min: 0, max: 9999, hint: "Low numbers first." },
  {
    type: "checkbox",
    name: "published",
    label: "Published",
    hint: "An unpublished HMO is invisible to the /hmo-check typeahead, aliases included.",
  },
];

const COLUMNS: readonly Column<Hmo>[] = [
  { label: "HMO", sortKey: "name", value: (row) => row.name, primary: true },
  {
    label: "Also known as",
    value: (row) => (row.aliases.length > 0 ? row.aliases.join(", ") : "—"),
  },
  { label: "Co-pay", sortKey: "copayApplies", value: (row) => (row.copayApplies ? "Yes" : "No") },
  { label: "Status", sortKey: "published", value: (row) => (row.published ? "Published" : "Draft") },
];

export const hmoResource: ResourceConfig<Hmo, typeof hmoSchema> = {
  name: "hmos",
  singular: "HMO",
  plural: "HMOs",
  description:
    "Insurers Paelon accepts, and the names patients search for them by. Coverage is what the agreement says — never what the plan usually covers.",
  emptyMessage: "No HMOs yet. The /hmo-check typeahead returns nothing until one is published.",
  fields: FIELDS,
  columns: COLUMNS,
  schema: hmoSchema,
  titleField: "name",
  deleteWarning:
    "This HMO is live. Deleting it takes it out of the /hmo-check typeahead — including every alias — so a patient searching for it will be told nothing was found.",
};
