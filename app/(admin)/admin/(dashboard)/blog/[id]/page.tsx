import type { Metadata } from "next";

import { BlogPostUsagePanel } from "@/components/admin/blog-post-usage-panel";
import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { blogPostResource } from "@/lib/admin/resources";

/**
 * `/admin/blog/[id]` — edit or delete one post.
 *
 * The id is not validated here: `ResourceEditorScreen` looks the row up and
 * calls `notFound()` when there is none, which covers a malformed id and a
 * deleted row with the same 404 rather than two different failures.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit post",
  robots: { index: false, follow: false, nocache: true },
};

export default async function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ResourceEditorScreen
      resource="blog"
      config={blogPostResource}
      id={id}
      renderAside={(post) => <BlogPostUsagePanel post={post} />}
    />
  );
}
