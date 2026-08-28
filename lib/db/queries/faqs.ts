import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { faqs, type Faq } from "@/lib/db/schema";

import { CACHE_TAGS, cachedRead, publicFilter, publicFilterWith } from "./shared";

/** All published FAQs, in display order. */
export const getFaqs = cachedRead(
  async (): Promise<Faq[]> =>
    db()
      .select()
      .from(faqs)
      .where(publicFilter(faqs))
      .orderBy(asc(faqs.order)),
  ["faqs", "published"],
  [CACHE_TAGS.faqs],
);

/** Published FAQs in one category. Backs the `FAQPage` JSON-LD per master spec §11. */
export async function getFaqsByCategory(
  category: Faq["category"],
): Promise<Faq[]> {
  const read = cachedRead(
    async (c: Faq["category"]) =>
      db()
        .select()
        .from(faqs)
        .where(publicFilterWith(faqs, eq(faqs.category, c)))
        .orderBy(asc(faqs.order)),
    ["faqs", "by-category"],
    [CACHE_TAGS.faqs],
  );
  return read(category);
}
