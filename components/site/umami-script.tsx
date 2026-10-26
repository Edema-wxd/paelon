import Script from "next/script";

import { umamiConfig } from "@/lib/analytics/umami-config";

/**
 * The Umami tracker (master spec §9), in the root layout.
 *
 * Renders nothing unless `umamiConfig()` says this build tracks — both
 * variables set and a public site URL — so a local machine and an unconfigured
 * preview ship no tracker at all. `data-domains` keeps configured previews out
 * of the real figures. `track()` in `lib/analytics/track.ts` no-ops in that state, which is
 * why no call site guards.
 *
 * ## Why `afterInteractive`, and why no nonce
 *
 * `middleware.ts` builds a CSP with no `'unsafe-inline'` on `script-src`,
 * admitting scripts by `'nonce-…' 'strict-dynamic'`. The obvious wiring is to
 * read that nonce off the `x-nonce` request header and pass it here — and it
 * works, but `headers()` is a dynamic API, so reading it in the root layout
 * makes every route in the app dynamic. Measured on this build: with the nonce
 * read in place, `/`, `/about`, `/contact`, `/services`, `/locations`,
 * `/privacy`, `/terms` and the rest flip from prerendered to server-rendered on
 * demand, and the SSG routes lose their revalidate windows. Every page view
 * would then wait on Postgres before first byte, against an LCP budget of 2.0s
 * (§13). The tracker is not worth that.
 *
 * `afterInteractive` needs no nonce. next/script does not put a `<script>` tag
 * in the server HTML for that strategy — the prerendered markup carries only a
 * `<link rel="preload" as="script">`, and the element itself is created at
 * hydration by Next's own client runtime, which is nonced. `'strict-dynamic'`
 * exists precisely to propagate trust to a script inserted by an already
 * trusted script, so the tracker loads under the enforced policy. The preload
 * is matched by the `script-src` host entry that `contentSecurityPolicy()`
 * already adds from this same env var.
 *
 * The strategy is right on its own merits too: page views and clicks are not
 * needed before hydration, and `beforeInteractive` would put a third-party
 * request in front of the LCP render. Umami sets no cookies (§9), so there is
 * no consent gate to wait for either.
 *
 * If the nonce is wanted regardless, the change is `strategy="beforeInteractive"`
 * plus `nonce={(await headers()).get("x-nonce") ?? undefined}` here — and the
 * dynamic-rendering cost above comes with it. See `docs/decisions.md`.
 */
export function UmamiScript() {
  const config = umamiConfig();
  if (!config) return null;

  return (
    <Script
      src={config.src}
      data-website-id={config.websiteId}
      data-domains={config.host}
      strategy="afterInteractive"
    />
  );
}
