import type { Metadata } from "next";

import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { authorResource } from "@/lib/admin/resources";

/**
 * `/admin/authors/[id]` — edit or delete one author.
 *
 * A delete here is a soft delete like any other, and the row stays pointed at:
 * `blog_posts.author_id` is `on delete restrict`, so the byline under a
 * published post cannot be pulled out from under it by a hard delete either.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit author",
  robots: { index: false, follow: false, nocache: true },
};

export default async function EditAuthorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResourceEditorScreen resource="authors" config={authorResource} id={id} />;
}
