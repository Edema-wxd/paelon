import type { Metadata } from "next";

import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { authorResource } from "@/lib/admin/resources";

/** `/admin/authors/new` — create an author. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New author",
  robots: { index: false, follow: false, nocache: true },
};

export default async function NewAuthorPage() {
  return <ResourceEditorScreen resource="authors" config={authorResource} />;
}
