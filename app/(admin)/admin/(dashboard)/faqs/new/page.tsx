import type { Metadata } from "next";

import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { faqResource } from "@/lib/admin/resources";

/** `/admin/faqs/new` — create a faq. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New faq",
  robots: { index: false, follow: false, nocache: true },
};

export default async function NewFaqsPage() {
  return <ResourceEditorScreen resource="faqs" config={faqResource} />;
}
