import type { Metadata } from "next";

import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { blogPostResource } from "@/lib/admin/resources";

/** `/admin/blog/new` — write a post. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New post",
  robots: { index: false, follow: false, nocache: true },
};

export default async function NewBlogPostPage() {
  return <ResourceEditorScreen resource="blog" config={blogPostResource} />;
}
