import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { faqServices, faqs, services, type Faq } from "@/lib/db/schema";

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

function selectFaqsForService(serviceId: string, options: ReadOptions): Promise<Faq[]> {
  return db()
    .select({ faq: faqs })
    .from(faqs)
    .innerJoin(faqServices, eq(faqServices.faqId, faqs.id))
    .where(visibleFilterWith(faqs, options, eq(faqServices.serviceId, serviceId)))
    .orderBy(asc(faqs.order), asc(faqs.question))
    .then((rows) => rows.map((row) => row.faq));
}

/**
 * Published FAQs assigned to one service (`faq_services`, migration 0007), in
 * display order. Only assigned FAQs: a service with none assigned shows no FAQ
 * section, by Francis's ruling of 2026-10-26 — category does not reach service
 * pages any more.
 *
 * Cached under the `faqs` tag, which every FAQ save revalidates, so ticking a
 * service in the FAQ editor reaches its page on the next request.
 */
export async function getFaqsForService(
  serviceId: string,
  options: ReadOptions = {},
): Promise<Faq[]> {
  if (options.draft) return selectFaqsForService(serviceId, options);

  const read = cachedRead(
    async (id: string) => selectFaqsForService(id, {}),
    ["faqs", "by-service"],
    [CACHE_TAGS.faqs],
  );
  return read(serviceId);
}

/**
 * The services an FAQ is assigned to, for the admin editor's "Where it
 * appears" panel: name, slug and whether that service's page is live. Not
 * cached — the panel must reflect the last save.
 */
export async function listFaqServices(
  faqId: string,
): Promise<{ name: string; slug: string; published: boolean }[]> {
  return db()
    .select({ name: services.name, slug: services.slug, published: services.published })
    .from(faqServices)
    .innerJoin(services, eq(services.id, faqServices.serviceId))
    .where(and(eq(faqServices.faqId, faqId), isNull(services.deletedAt)))
    .orderBy(asc(services.order), asc(services.name));
}
