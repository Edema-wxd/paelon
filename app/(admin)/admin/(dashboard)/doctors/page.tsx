import type { Metadata } from "next";

import { ResourceListScreen } from "@/components/admin/resource-list-screen";
import type { RawSearchParams } from "@/lib/admin/resource-view";
import { doctorResource } from "@/lib/admin/resources";

/**
 * `/admin/doctors` — the Doctors list (spec §8).
 *
 * Thin on purpose: the screen is `ResourceListScreen` and the type is
 * `doctorResource`. Everything specific to doctors is in that config, which is
 * what the CRUD kit exists to make true.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Doctors",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminDoctorsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <ResourceListScreen
      resource="doctors"
      config={doctorResource}
      searchParams={await searchParams}
    />
  );
}
