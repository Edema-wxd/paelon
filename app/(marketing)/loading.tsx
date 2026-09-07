import { RouteLoader } from "@/components/site/route-loader";

/**
 * Default loading boundary for every marketing route.
 *
 * It renders in place of `{children}` inside `(marketing)/layout.tsx`, so the
 * header, footer and sticky mobile bar stay on screen and only the page body
 * swaps — the nav stays usable while the next route resolves.
 *
 * Sections with a more specific label override this with their own
 * `loading.tsx`; the nearest boundary above the route wins.
 */
export default function MarketingLoading() {
  return <RouteLoader />;
}
