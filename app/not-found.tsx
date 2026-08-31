import type { Metadata } from "next";

import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { MobileBottomBar } from "@/components/site/mobile-bottom-bar";
import { NotFoundContent } from "@/components/site/not-found-content";

/**
 * The site's only 404. Serves both URLs that matched no route and `notFound()`
 * calls raised inside a route, such as an unknown branch slug.
 *
 * Next renders this inside `app/layout.tsx` and nothing else, so the header,
 * `<main>` and footer are assembled here rather than inherited.
 *
 * Spec §3 puts this file at `app/(marketing)/not-found.tsx`. It is at the root
 * instead, deliberately. A route group is not a URL segment, so a `not-found`
 * inside `(marketing)` is hoisted to root level and renders *outside*
 * `(marketing)/layout.tsx` — verified against a production build, where it came
 * back with no header, no footer and no `<main id="main">`, which also breaks
 * the skip link. One root file is the only arrangement that renders complete
 * chrome on both paths.
 *
 * Old WordPress links land here until the redirect list arrives, so it is
 * carrying real inbound traffic. See `lib/redirects.ts`.
 */

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "The page you asked for is not on the Paelon Memorial Hospital site. Find a department, a branch, or our 24 hour emergency line.",
  // A 404 already carries the status code, but the meta tag also covers crawlers
  // that reach this body through a soft 404.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
      <Header />
      {/* Bottom padding clears the sticky mobile bar, matching the marketing
          layout so the last element is never covered. */}
      <main id="main" className="pb-20 lg:pb-0">
        <NotFoundContent />
      </main>
      <Footer />
      <MobileBottomBar />
    </>
  );
}
