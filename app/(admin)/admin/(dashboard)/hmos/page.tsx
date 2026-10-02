import type { Metadata } from "next";

import { ResourceListScreen } from "@/components/admin/resource-list-screen";
import type { RawSearchParams } from "@/lib/admin/resource-view";
import { hmoResource } from "@/lib/admin/resources";

/**
 * `/admin/hmos` — the HMOs list (spec §8).
 *
 * Thin on purpose: the screen is `ResourceListScreen` and the type is
 * `hmoResource`. Everything specific to HMOs is in that config, which is
 * what the CRUD kit exists to make true.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HMOs",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminHmosPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <ResourceListScreen
      resource="hmos"
      config={hmoResource}
      searchParams={await searchParams}
    />
  );
}
