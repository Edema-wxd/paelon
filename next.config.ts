import type { NextConfig } from "next";

import { redirectsForNextConfig } from "./lib/redirects";

const nextConfig: NextConfig = {
  /**
   * 301s from the old WordPress site. The list itself lives in lib/redirects.ts
   * and is currently empty pending the old URL export (master spec §18).
   */
  async redirects() {
    return redirectsForNextConfig();
  },

  images: {
    /**
     * AVIF first, WebP as the fallback negotiation target. Next serves the
     * first format the browser advertises in its Accept header, so AVIF goes
     * to everything current and WebP covers the rest. AVIF is typically
     * 20-30% smaller than WebP on photographs, which matters here because the
     * hero is the LCP element and spec §13 caps LCP at 2.0s on slow 4G.
     *
     * Cost: AVIF encoding is slower on a cold request. Responses are cached
     * after the first hit, so this is a one-off per source/size/quality.
     */
    formats: ["image/avif", "image/webp"],

    /**
     * Widths Next may generate for images whose `sizes` uses viewport units.
     * Tuned to this site rather than left at the default ladder: the layout
     * container tops out at 1440px (`max-w-360`), and the hero is the only
     * full-bleed element, so 2560/3840 exist purely to cover 2x and 3x
     * displays at that width. The 390 entry covers the common phone width
     * that the mobile crops target.
     */
    deviceSizes: [390, 640, 828, 1080, 1440, 1920, 2560, 3840],

    /**
     * Widths for fixed-size elements (`sizes` given in px). Every entry must
     * stay below the smallest deviceSize or Next will never pick it. 176
     * matches the HMO logo slot, 320 the testimonial portrait at 3x.
     */
    imageSizes: [64, 96, 128, 176, 256, 320, 384],

    /**
     * Left OFF deliberately. Enabling it lets the optimizer serve SVG, which
     * can carry scripts — not a risk worth taking on a hospital site. SVG
     * logos are served straight from /public with the optimizer bypassed
     * instead; see `SiteImage`, which sets `unoptimized` for .svg sources.
     */
    dangerouslyAllowSVG: false,
  },
};

export default nextConfig;
