import type { Metadata } from "next";

import { ResourceListScreen } from "@/components/admin/resource-list-screen";
import type { RawSearchParams } from "@/lib/admin/resource-view";
import { faqResource } from "@/lib/admin/resources";

/**
 * `/admin/faqs` — the FAQs list (spec §8).
 *
 * Thin on purpose: the screen is `ResourceListScreen` and the type is
 * `faqResource`. Everything specific to FAQs is in that config, which is
 * what the CRUD kit exists to make true.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FAQs",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminFaqsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <ResourceListScreen
      resource="faqs"
      config={faqResource}
      searchParams={await searchParams}
    />
  );
}
