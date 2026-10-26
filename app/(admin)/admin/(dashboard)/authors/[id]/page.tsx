import type { Metadata } from "next";

import { AuthorUsagePanel } from "@/components/admin/author-usage-panel";
import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { authorResource } from "@/lib/admin/resources";

/**
 * `/admin/authors/[id]` — edit or delete one author.
 *
 * A delete is soft, so `blog_posts.author_id`'s `on delete restrict` never
 * fires; deleting an author who still has posts is refused by the
 * `beforeDelete` hook in `lib/admin/resources/server.ts` instead.
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
  return (
    <ResourceEditorScreen
      resource="authors"
      config={authorResource}
      id={id}
      renderAside={(author) => <AuthorUsagePanel author={author} />}
    />
  );
}
