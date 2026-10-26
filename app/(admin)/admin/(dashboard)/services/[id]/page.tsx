import type { Metadata } from "next";

import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { SectionsEditor } from "@/components/admin/sections-editor";
import { sectionPickableMedia } from "@/lib/admin/section-media";
import { saveServiceSectionsAction } from "@/lib/admin/sections-actions";
import { getSectionsForEditor } from "@/lib/db/queries/sections";
import { serviceResource } from "@/lib/admin/resources";

/**
 * `/admin/services/[id]` — edit or delete one service.
 *
 * The id is not validated here: `ResourceEditorScreen` looks the row up and
 * calls `notFound()` when there is none, which covers a malformed id and a
 * deleted row with the same 404 rather than two different failures.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit service",
  robots: { index: false, follow: false, nocache: true },
};

export default async function EditServicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ResourceEditorScreen
      resource="services"
      config={serviceResource}
      id={id}
      renderBelow={async (service) => {
        const sections = await getSectionsForEditor({ page: "service", serviceId: service.id });
        return (
          <SectionsEditor
            initialSections={sections}
            media={await sectionPickableMedia(sections)}
            save={saveServiceSectionsAction}
            target={{ serviceId: service.id }}
            pageName="this service’s page, under its name and booking buttons"
          />
        );
      }}
    />
  );
}
