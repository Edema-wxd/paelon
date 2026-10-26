import { z } from "zod";

import type { Column, Field, ResourceConfig } from "@/lib/admin/resource-config";
import { faqCategoryEnum, type Faq } from "@/lib/db/schema";

import {
  checkboxField,
  idListField,
  markdownWithoutHeadings,
  orderField,
  requiredText,
  slugField,
} from "./fields";

/**
 * `/admin/faqs` (spec §8, content type `faqs` in §5).
 *
 * The simplest content type there is — a question, an answer, a category — and
 * therefore the one that proves the CRUD kit carries its own weight: this file
 * is the whole screen.
 *
 * FAQs have no image, so the kit's image field is proven by `awards.ts` instead.
 *
 * The answer is Markdown, rendered on the marketing site by `lib/markdown.ts`.
 * The `question` is not: a heading with emphasis in it reads as a mistake, and
 * the FAQ accordion's `<summary>` is plain text.
 */

/** `faq_services` (migration 0007): the service pages this FAQ appears on. */
export const FAQ_SERVICES_FIELD = "serviceIds";

export const FAQ_CATEGORY_LABELS: Record<Faq["category"], string> = {
  general: "General",
  booking: "Booking",
  services: "Services",
  insurance: "Insurance",
  emergencies: "Emergencies",
};

export const faqSchema = z.object({
  question: requiredText("the question", 300),
  answer: markdownWithoutHeadings("the answer", 4000),
  category: z.enum(faqCategoryEnum.enumValues, "Choose a category."),
  [FAQ_SERVICES_FIELD]: idListField("services"),
  slug: slugField,
  order: orderField,
  published: checkboxField,
});

export type FaqInput = z.output<typeof faqSchema>;

const FIELDS: readonly Field[] = [
  {
    type: "text",
    name: "question",
    label: "Question",
    required: true,
    maxLength: 300,
    section: "Question and answer",
    hint: "As a patient would ask it.",
  },
  {
    type: "markdown",
    name: "answer",
    label: "Answer",
    required: true,
    rows: 8,
    headings: false,
    section: "Question and answer",
    hint: "Links are written as [text](/path) and must point at pages that exist.",
  },
  {
    type: "multiselect",
    name: FAQ_SERVICES_FIELD,
    label: "Service pages",
    section: "Where it shows",
    hint: "The service pages this FAQ appears on — only those. A service page shows nothing but the FAQs ticked for it here.",
    emptyLabel: "No services yet — create one under Services first.",
  },
  {
    type: "select",
    name: "category",
    label: "Category",
    required: true,
    section: "Where it shows",
    width: "half",
    options: faqCategoryEnum.enumValues.map((value) => ({
      value,
      label: FAQ_CATEGORY_LABELS[value],
    })),
    hint: "“General” FAQs show on the homepage and every branch page. Other categories show only on the service pages ticked above.",
  },
  {
    type: "slug",
    name: "slug",
    label: "Reference",
    from: "question",
    required: true,
    section: "Where it shows",
    width: "half",
    hint: "Generated from the question until you edit it.",
  },
  {
    type: "number",
    name: "order",
    label: "Order",
    min: 0,
    max: 9999,
    hint: "Low numbers first, on every page the FAQ appears on.",
  },
  {
    type: "checkbox",
    name: "published",
    label: "Published",
    hint: "A draft FAQ appears nowhere, including in the pages’ FAQ structured data.",
  },
];

const COLUMNS: readonly Column<Faq>[] = [
  { label: "Question", sortKey: "question", value: (row) => row.question, primary: true },
  { label: "Category", sortKey: "category", value: (row) => FAQ_CATEGORY_LABELS[row.category] },
  { label: "Order", sortKey: "order", value: (row) => String(row.order) },
  { label: "Status", sortKey: "published", value: (row) => (row.published ? "Published" : "Draft") },
];

export const faqResource: ResourceConfig<Faq, typeof faqSchema> = {
  name: "faqs",
  singular: "FAQ",
  plural: "FAQs",
  description:
    "Questions and answers. “General” FAQs show on the homepage and branch pages; others show on the service pages they are assigned to. Answers appear as real text in the page and in its FAQ structured data.",
  emptyMessage: "No FAQs yet. The FAQ section does not render on a page with none.",
  fields: FIELDS,
  columns: COLUMNS,
  schema: faqSchema,
  titleField: "question",
};
