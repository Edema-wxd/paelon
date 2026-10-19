import type { Metadata } from "next";

import { ResourceListScreen } from "@/components/admin/resource-list-screen";
import type { RawSearchParams } from "@/lib/admin/resource-view";
import { authorResource } from "@/lib/admin/resources";

/**
 * `/admin/authors` — the Authors list (spec §8).
 *
 * Thin on purpose: the screen is `ResourceListScreen` and the type is
 * `authorResource`.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Authors",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminAuthorsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <ResourceListScreen
      resource="authors"
      config={authorResource}
      searchParams={await searchParams}
    />
  );
}
