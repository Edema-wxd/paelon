import type { Metadata } from "next";

import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { testimonialResource } from "@/lib/admin/resources";

/**
 * `/admin/testimonials/[id]` — edit or delete one testimonial.
 *
 * The id is not validated here: `ResourceEditorScreen` looks the row up and
 * calls `notFound()` when there is none, which covers a malformed id and a
 * deleted row with the same 404 rather than two different failures.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit testimonial",
  robots: { index: false, follow: false, nocache: true },
};

export default async function EditTestimonialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResourceEditorScreen resource="testimonials" config={testimonialResource} id={id} />;
}
