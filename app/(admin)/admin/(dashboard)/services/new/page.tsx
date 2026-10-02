import type { Metadata } from "next";

import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { serviceResource } from "@/lib/admin/resources";

/** `/admin/services/new` — create a service. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New service",
  robots: { index: false, follow: false, nocache: true },
};

export default async function NewServicesPage() {
  return <ResourceEditorScreen resource="services" config={serviceResource} />;
}
