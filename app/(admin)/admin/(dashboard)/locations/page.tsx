import type { Metadata } from "next";

import { ResourceListScreen } from "@/components/admin/resource-list-screen";
import type { RawSearchParams } from "@/lib/admin/resource-view";
import { locationResource } from "@/lib/admin/resources";

/**
 * `/admin/locations` — the Locations list (spec §8).
 *
 * Thin on purpose: the screen is `ResourceListScreen` and the type is
 * `locationResource`. Everything specific to branches is in that config, which is
 * what the CRUD kit exists to make true.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Locations",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLocationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <ResourceListScreen
      resource="locations"
      config={locationResource}
      searchParams={await searchParams}
    />
  );
}
