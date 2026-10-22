import type { Metadata } from "next";

import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { awardResource } from "@/lib/admin/resources";

/** `/admin/awards/new` — create a award. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New award",
  robots: { index: false, follow: false, nocache: true },
};

export default async function NewAwardsPage() {
  return <ResourceEditorScreen resource="awards" config={awardResource} />;
}
