import type { Metadata } from "next";

import { HmoUsagePanel } from "@/components/admin/hmo-usage-panel";
import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { hmoResource } from "@/lib/admin/resources";

/**
 * `/admin/hmos/[id]` — edit or delete one HMO.
 *
 * The id is not validated here: `ResourceEditorScreen` looks the row up and
 * calls `notFound()` when there is none, which covers a malformed id and a
 * deleted row with the same 404 rather than two different failures.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit HMO",
  robots: { index: false, follow: false, nocache: true },
};

export default async function EditHmosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ResourceEditorScreen
      resource="hmos"
      config={hmoResource}
      id={id}
      renderAside={(hmo) => <HmoUsagePanel hmo={hmo} />}
    />
  );
}
