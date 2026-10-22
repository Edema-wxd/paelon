import type { Metadata } from "next";

import { ResourceListScreen } from "@/components/admin/resource-list-screen";
import type { RawSearchParams } from "@/lib/admin/resource-view";
import { serviceResource } from "@/lib/admin/resources";

/**
 * `/admin/services` — the Services list (spec §8).
 *
 * Thin on purpose: the screen is `ResourceListScreen` and the type is
 * `serviceResource`. Everything specific to services is in that config, which is
 * what the CRUD kit exists to make true.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Services",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminServicesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <ResourceListScreen
      resource="services"
      config={serviceResource}
      searchParams={await searchParams}
    />
  );
}
