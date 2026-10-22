import type { Metadata } from "next";

import { ResourceListScreen } from "@/components/admin/resource-list-screen";
import type { RawSearchParams } from "@/lib/admin/resource-view";
import { awardResource } from "@/lib/admin/resources";

/**
 * `/admin/awards` — the Awards list (spec §8).
 *
 * Thin on purpose: the screen is `ResourceListScreen` and the type is
 * `awardResource`. Everything specific to Awards is in that config, which is
 * what the CRUD kit exists to make true.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Awards",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminAwardsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <ResourceListScreen
      resource="awards"
      config={awardResource}
      searchParams={await searchParams}
    />
  );
}
