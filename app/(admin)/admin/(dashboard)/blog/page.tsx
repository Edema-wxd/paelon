import type { Metadata } from "next";

import { ResourceListScreen } from "@/components/admin/resource-list-screen";
import type { RawSearchParams } from "@/lib/admin/resource-view";
import { blogPostResource } from "@/lib/admin/resources";

/**
 * `/admin/blog` — the Blog posts list (spec §8).
 *
 * Thin on purpose: the screen is `ResourceListScreen` and the type is
 * `blogPostResource`. Everything specific to posts lives in that config —
 * including the publish rules for Conversion baseline item 14, which are in the
 * schema and in the `validate` hook, not here.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog posts",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <ResourceListScreen
      resource="blog"
      config={blogPostResource}
      searchParams={await searchParams}
    />
  );
}
