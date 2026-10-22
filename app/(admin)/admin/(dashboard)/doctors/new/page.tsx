import type { Metadata } from "next";

import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { doctorResource } from "@/lib/admin/resources";

/** `/admin/doctors/new` — create a doctor. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New doctor",
  robots: { index: false, follow: false, nocache: true },
};

export default async function NewDoctorsPage() {
  return <ResourceEditorScreen resource="doctors" config={doctorResource} />;
}
