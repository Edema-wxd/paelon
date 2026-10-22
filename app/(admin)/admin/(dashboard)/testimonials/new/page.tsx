import type { Metadata } from "next";

import { ResourceEditorScreen } from "@/components/admin/resource-editor-screen";
import { testimonialResource } from "@/lib/admin/resources";

/** `/admin/testimonials/new` — record a testimonial. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New testimonial",
  robots: { index: false, follow: false, nocache: true },
};

export default async function NewTestimonialPage() {
  return <ResourceEditorScreen resource="testimonials" config={testimonialResource} />;
}
