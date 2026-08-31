/**
 * Image slot specifications.
 *
 * Single source of truth for every image on the site: the engine in
 * `scripts/optimize-images.mjs` reads these to decide what to emit, and
 * `SiteImage` reads them to set width/height/sizes. Change a dimension here
 * and both follow.
 *
 * `desktop` and `mobile` are RENDERED CSS pixels at a 1440px and a 390px
 * viewport respectively — the sizes the browser lays the element out at, not
 * the file dimensions. The engine multiplies by `dpr` to get the file it
 * writes.
 *
 * `artDirected` is the important flag. Most slots keep the same crop at every
 * width, so one master at the largest needed size plus `object-cover` is
 * correct and a separate mobile file would be waste. Only set it where the
 * composition genuinely has to change — the hero, which goes from a wide
 * landscape band to a near-portrait crop.
 */

export type ImageKind =
  | "hero"
  | "service-card"
  | "about-feature"
  | "hmo-logo"
  | "portrait"
  | "logo";

export interface ImageSlot {
  /** Rendered CSS size at a 1440px viewport. */
  desktop: { width: number; height: number };
  /** Rendered CSS size at a 390px viewport. */
  mobile: { width: number; height: number };
  /** Master multiplier. 2 for large art, 3 for small elements where the
   *  pixel cost is trivial and phone DPR is usually 3. */
  dpr: 2 | 3;
  /** `sizes` attribute. Must match how the element actually lays out or Next
   *  picks the wrong srcset entry. */
  sizes: string;
  /** Emit a separately cropped mobile file. Only where the composition
   *  changes, not merely because the element is smaller. */
  artDirected: boolean;
  /** Above the fold — sets `priority` and disables lazy loading. */
  priority?: boolean;
  /** Per-file ceiling in KB. See the budget note at the foot of this file. */
  maxKB: number;
  /** Vector is the correct format for this slot; raster is a fallback. */
  preferSvg?: boolean;
}

export const IMAGE_SLOTS: Record<ImageKind, ImageSlot> = {
  hero: {
    desktop: { width: 1440, height: 681 },
    mobile: { width: 390, height: 468 },
    dpr: 2,
    sizes: "100vw",
    artDirected: true,
    priority: true,
    maxKB: 200,
  },
  "service-card": {
    desktop: { width: 400, height: 304 },
    mobile: { width: 304, height: 236 },
    dpr: 3,
    sizes: "(min-width: 1024px) 400px, 78vw",
    artDirected: false,
    maxKB: 40,
  },
  "about-feature": {
    desktop: { width: 620, height: 413 },
    mobile: { width: 358, height: 239 },
    dpr: 2,
    sizes: "(min-width: 1024px) 620px, 100vw",
    artDirected: false,
    maxKB: 90,
  },
  "hmo-logo": {
    desktop: { width: 176, height: 80 },
    mobile: { width: 155, height: 80 },
    dpr: 3,
    sizes: "176px",
    artDirected: false,
    maxKB: 15,
    preferSvg: true,
  },
  portrait: {
    desktop: { width: 100, height: 100 },
    mobile: { width: 100, height: 100 },
    dpr: 3,
    sizes: "100px",
    artDirected: false,
    maxKB: 12,
  },
  logo: {
    desktop: { width: 138, height: 64 },
    mobile: { width: 110, height: 51 },
    dpr: 3,
    sizes: "138px",
    artDirected: false,
    maxKB: 15,
    preferSvg: true,
  },
};

/** Input extensions the engine accepts. Set by Francis: PNG, SVG, AVIF, WebP.
 *  JPEG is deliberately NOT on this list — see assets/README.md. */
export const ACCEPTED_SOURCE_EXTENSIONS = [
  ".png",
  ".svg",
  ".avif",
  ".webp",
] as const;

/**
 * Homepage byte budget, against the 800 KB page-weight cap in spec §13.
 *
 * The shell (HTML + JS + CSS, gzipped) measures 203 KB, leaving ~597 KB.
 * Spending every slot to its ceiling costs:
 *
 *   hero            200
 *   service-card     40 x 5 = 200
 *   about-feature    90
 *   hmo-logo         15 x 4 =  60  (0 if supplied as SVG, which is preferred)
 *   portrait         12
 *   -------------------------
 *   total           562 KB  ->  765 KB with the shell
 *
 * That clears the cap, but only just, and only because the HMO logos are
 * expected to be vector. Everything except the hero lazy-loads, so a
 * Lighthouse run will read lower than the real figure for someone who
 * scrolls. Treat 562 KB as the hard ceiling for homepage imagery.
 */
export const HOMEPAGE_IMAGE_BUDGET_KB = 562;
