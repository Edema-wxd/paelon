import type { Metadata } from "next";

import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { hmoResource } from "@/lib/admin/resources";

/** `/admin/hmos/new` — create a HMO. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New HMO",
  robots: { index: false, follow: false, nocache: true },
};

export default async function NewHmosPage() {
  return <ResourceEditorScreen resource="hmos" config={hmoResource} />;
}
