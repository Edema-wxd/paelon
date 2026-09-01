#!/usr/bin/env node
/**
 * Open Graph card generator.
 *
 * Composites the brand logo onto a 1200x630 cream card and writes
 * `public/og.png` — the single share image referenced by every page's
 * `openGraph.images` / `twitter.images` (see lib/seo.ts).
 *
 *   node scripts/generate-og-image.mjs
 *
 * PNG, not AVIF/WebP: LinkedIn, WhatsApp and several Slack unfurlers still
 * reject the modern formats the main image pipeline emits, so this card is
 * deliberately outside scripts/optimize-images.mjs.
 *
 * TODO(brand): assets/logo/main.svg is a 175x81 raster wrapped in an SVG
 * shell, so the mark is upscaled ~2.6x here and is soft under inspection.
 * Drop a real vector or >=1400px master at assets/logo/main.svg and re-run —
 * no code change needed.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOGO = join(ROOT, "assets", "logo", "main.svg");
const OUT = join(ROOT, "public", "og.png");

/** Facebook/LinkedIn/X all render 1.91:1 without cropping at this size. */
const WIDTH = 1200;
const HEIGHT = 630;

/** Brand tokens, mirrored from styles/globals.css :root. */
const CREAM = "#f9f7f2";
const NAVY = "#223645";
const MAROON = "#a02b3e";

/** Logo width on the card. Keeps the upscale factor low enough to stay legible. */
const LOGO_WIDTH = 560;
/** Height of the brand bar along the bottom edge. */
const BAR_HEIGHT = 14;

/**
 * The logo master is a raster PNG wrapped in an SVG `<pattern>`. sharp renders
 * that shell at its declared 138x64 CSS size and only then scales, which
 * throws away resolution the embedded bitmap actually has — so pull the
 * base64 payload out and resize from the 175x81 original instead.
 */
async function loadLogo() {
  const svg = await readFile(LOGO, "utf8");
  const embedded = svg.match(/base64,\s*([A-Za-z0-9+/=\s]+?)"/);
  if (!embedded?.[1]) {
    // A true vector master: let sharp rasterise it at the density we need.
    return sharp(LOGO, { density: 600 });
  }
  return sharp(Buffer.from(embedded[1].replace(/\s/g, ""), "base64"));
}

const logo = await (await loadLogo())
  .resize({ width: LOGO_WIDTH, kernel: "lanczos3", fit: "inside" })
  .sharpen({ sigma: 0.6 })
  .png()
  .toBuffer();

const { height: logoHeight = 0 } = await sharp(logo).metadata();

const bar = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${BAR_HEIGHT}">` +
    `<rect width="${WIDTH}" height="${BAR_HEIGHT}" fill="${NAVY}"/>` +
    `<rect width="${WIDTH / 3}" height="${BAR_HEIGHT}" fill="${MAROON}"/>` +
    `</svg>`,
);

const card = await sharp({
  create: {
    width: WIDTH,
    height: HEIGHT,
    channels: 4,
    background: CREAM,
  },
})
  .composite([
    {
      input: logo,
      left: Math.round((WIDTH - LOGO_WIDTH) / 2),
      // Optically centred: the bottom bar pulls the eye down, so sit the mark
      // slightly above true centre.
      top: Math.round((HEIGHT - logoHeight) / 2 - 20),
    },
    { input: bar, left: 0, top: HEIGHT - BAR_HEIGHT },
  ])
  .png({ compressionLevel: 9 })
  .toBuffer();

await writeFile(OUT, card);

console.info(
  `og: ${WIDTH}x${HEIGHT} -> public/og.png (${(card.length / 1024).toFixed(1)} KB)`,
);
