import type { Metadata } from "next";

import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { locationResource } from "@/lib/admin/resources";

/** `/admin/locations/new` — create a location. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New location",
  robots: { index: false, follow: false, nocache: true },
};

export default async function NewLocationsPage() {
  return <ResourceEditorScreen resource="locations" config={locationResource} />;
}
