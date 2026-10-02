import type { Metadata } from "next";

import { ResourceListScreen } from "@/components/admin/resource-list-screen";
import type { RawSearchParams } from "@/lib/admin/resource-view";
import { testimonialResource } from "@/lib/admin/resources";

/**
 * `/admin/testimonials` — the Testimonials list (spec §8).
 *
 * The consent column is why this list is worth reading: it is the one place
 * every quote's consent state can be seen at once, and an unconsented row is
 * invisible on the marketing site no matter what its status says.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Testimonials",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminTestimonialsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <ResourceListScreen
      resource="testimonials"
      config={testimonialResource}
      searchParams={await searchParams}
    />
  );
}
