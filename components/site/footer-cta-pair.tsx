import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Footer CTA pair: Book / Find a Branch (spec §6). Absent from the Figma
 * export — built fresh, sitting directly above the footer.
 */
export function FooterCtaPair() {
  return (
    <section aria-labelledby="footer-cta-heading" className="bg-background py-16">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 id="footer-cta-heading" className="text-2xl text-primary lg:text-3xl">
          Ready when you are
        </h2>
        {/* min-w rather than a fixed w, for the reason set out in
            hero-section.tsx: `size="pill"` is `whitespace-nowrap`, and
            "Book Appointment" already sits within a few pixels of 200px. */}
        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
          <Button asChild size="pill" className="w-full sm:w-auto sm:min-w-50">
            <Link href="/book">Book Appointment</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="pill"
            className="w-full sm:w-auto sm:min-w-50"
          >
            <Link href="/locations">Find a Branch</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
