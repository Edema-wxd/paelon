import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { faqs, type Faq } from "@/lib/db/schema";

import {
  CACHE_TAGS,
  cachedRead,
  visibleFilter,
  visibleFilterWith,
  type ReadOptions,
} from "./shared";

function selectFaqs(options: ReadOptions): Promise<Faq[]> {
  return db()
    .select()
    .from(faqs)
    .where(visibleFilter(faqs, options))
    .orderBy(asc(faqs.order));
}

const cachedFaqs = cachedRead(
  async (): Promise<Faq[]> => selectFaqs({}),
  ["faqs", "published"],
  [CACHE_TAGS.faqs],
);

/** All published FAQs, in display order. Draft mode adds unpublished ones. */
export async function getFaqs(options: ReadOptions = {}): Promise<Faq[]> {
  return options.draft ? selectFaqs(options) : cachedFaqs();
}

function selectFaqsByCategory(
  category: Faq["category"],
  options: ReadOptions,
): Promise<Faq[]> {
  return db()
    .select()
    .from(faqs)
    .where(visibleFilterWith(faqs, options, eq(faqs.category, category)))
    .orderBy(asc(faqs.order));
}

/** Published FAQs in one category. Backs the `FAQPage` JSON-LD per master spec §11. */
export async function getFaqsByCategory(
  category: Faq["category"],
  options: ReadOptions = {},
): Promise<Faq[]> {
  if (options.draft) return selectFaqsByCategory(category, options);

  const read = cachedRead(
    async (c: Faq["category"]) => selectFaqsByCategory(c, {}),
    ["faqs", "by-category"],
    [CACHE_TAGS.faqs],
  );
  return read(category);
}
