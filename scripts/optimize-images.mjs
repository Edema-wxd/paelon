#!/usr/bin/env node
/**
 * Image engine.
 *
 * Reads masters from `assets/<kind>/<name>.<ext>` and writes optimised
 * derivatives to `public/images/<kind>/`. Dimensions come from IMAGE_SLOTS in
 * lib/images.ts, so this script never guesses a size.
 *
 *   node scripts/optimize-images.mjs           convert everything that changed
 *   node scripts/optimize-images.mjs --force   reconvert everything
 *   node scripts/optimize-images.mjs --check   report only, write nothing
 *
 * Output per raster master:
 *   <name>.avif             desktop, primary
 *   <name>.webp             desktop, fallback for the ~5% without AVIF
 *   <name>-mobile.avif      only when the slot is artDirected
 *   <name>-mobile.webp      "
 *
 * SVG masters are copied through untouched — rasterising vector would be a
 * downgrade, and the optimizer is bypassed for them anyway (see SiteImage).
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "assets");
const OUT_DIR = join(ROOT, "public", "images");
const MANIFEST = join(ROOT, "lib", "image-manifest.json");

const FORCE = process.argv.includes("--force");
const CHECK_ONLY = process.argv.includes("--check");

/** Encoder settings. AVIF effort 6 of 9 — near-best density without the
 *  pathological encode times of 8-9. Quality 62 is visually transparent for
 *  photographic content at these dimensions; raise it per-slot if a specific
 *  image shows banding. */
const AVIF = { quality: 62, effort: 6, chromaSubsampling: "4:2:0" };
const WEBP = { quality: 78, effort: 5 };

// --- read the slot table out of lib/images.ts -------------------------------
// Parsed rather than imported so this stays a plain .mjs script with no
// TypeScript loader in the chain.
async function loadSlots() {
  const src = await readFile(join(ROOT, "lib", "images.ts"), "utf8");
  const body = src.slice(
    src.indexOf("export const IMAGE_SLOTS"),
    src.indexOf("export const ACCEPTED_SOURCE_EXTENSIONS"),
  );
  const slots = {};
  const blockRe = /"?([a-z-]+)"?:\s*\{([\s\S]*?)\n {2}\},/g;
  let m;
  while ((m = blockRe.exec(body)) !== null) {
    const [, key, block] = m;
    const num = (name) => {
      const hit = block.match(new RegExp(`${name}:\\s*(\\d+)`));
      return hit ? Number(hit[1]) : null;
    };
    const dims = (which) => {
      const hit = block.match(
        new RegExp(`${which}:\\s*\\{\\s*width:\\s*(\\d+),\\s*height:\\s*(\\d+)`),
      );
      return hit ? { width: Number(hit[1]), height: Number(hit[2]) } : null;
    };
    slots[key] = {
      desktop: dims("desktop"),
      mobile: dims("mobile"),
      dpr: num("dpr"),
      maxKB: num("maxKB"),
      artDirected: /artDirected:\s*true/.test(block),
      preferSvg: /preferSvg:\s*true/.test(block),
    };
  }
  const accepted = [
    ...src
      .slice(src.indexOf("ACCEPTED_SOURCE_EXTENSIONS"))
      .matchAll(/"(\.[a-z]+)"/g),
  ].map((x) => x[1]);
  return { slots, accepted };
}

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const hash = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 12);

async function emit(buffer, target, box, fit) {
  const pipeline = sharp(buffer)
    .rotate() // honour EXIF orientation before resizing
    .resize({ ...box, fit, withoutEnlargement: true });
  const avif = await pipeline.clone().avif(AVIF).toBuffer();
  const webp = await pipeline.clone().webp(WEBP).toBuffer();
  if (!CHECK_ONLY) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(`${target}.avif`, avif);
    await writeFile(`${target}.webp`, webp);
  }
  return { avif: avif.length, webp: webp.length };
}

async function main() {
  if (!existsSync(SRC_DIR)) {
    console.error(
      `No assets/ directory. Create it and drop masters in assets/<kind>/ —\n` +
        `run with --check after adding files. Kinds are listed in lib/images.ts.`,
    );
    process.exit(1);
  }

  const { slots, accepted } = await loadSlots();
  const manifest = {};
  const rows = [];
  let totalAvif = 0;
  let breached = 0;
  let skipped = 0;

  const kinds = (await readdir(SRC_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const unknown = kinds.filter((k) => !slots[k]);
  if (unknown.length) {
    console.error(
      `Unknown asset folder(s): ${unknown.join(", ")}\n` +
        `Valid kinds: ${Object.keys(slots).join(", ")}`,
    );
    process.exit(1);
  }

  for (const kind of kinds) {
    const slot = slots[kind];
    const files = (await readdir(join(SRC_DIR, kind))).filter(
      (f) => !f.startsWith("."),
    );

    for (const file of files) {
      const ext = extname(file).toLowerCase();
      const name = file.slice(0, -ext.length);
      const source = join(SRC_DIR, kind, file);

      if (!accepted.includes(ext)) {
        console.error(
          `REJECTED  ${relative(ROOT, source)}\n` +
            `          "${ext}" is not an accepted source type. ` +
            `Accepted: ${accepted.join(", ")}`,
        );
        breached++;
        continue;
      }

      const buffer = await readFile(source);

      // SVG: pass straight through.
      if (ext === ".svg") {
        const out = join(OUT_DIR, kind, `${name}.svg`);
        if (!CHECK_ONLY) {
          await mkdir(dirname(out), { recursive: true });
          await writeFile(out, buffer);
        }
        manifest[`${kind}/${name}`] = {
          kind,
          src: `/images/${kind}/${name}.svg`,
          vector: true,
          width: slot.desktop.width,
          height: slot.desktop.height,
        };
        rows.push([`${kind}/${name}`, "svg", `${kb(buffer.length)} KB`, "pass"]);
        totalAvif += buffer.length;
        continue;
      }

      if (slot.preferSvg) {
        console.warn(
          `NOTE      ${kind}/${name} is raster; this slot renders better as SVG.`,
        );
      }

      // Skip unchanged sources unless --force.
      const stamp = hash(buffer);
      const existing = existsSync(join(OUT_DIR, kind, `${name}.avif`));
      if (existing && !FORCE) {
        const prev = existsSync(MANIFEST)
          ? JSON.parse(await readFile(MANIFEST, "utf8"))[`${kind}/${name}`]
          : null;
        if (prev?.stamp === stamp) {
          manifest[`${kind}/${name}`] = prev;
          const size = (await stat(join(OUT_DIR, kind, `${name}.avif`))).size;
          totalAvif += size;
          skipped++;
          rows.push([`${kind}/${name}`, "cached", `${kb(size)} KB`, "pass"]);
          continue;
        }
      }

      const d = slot.desktop;
      const desktopBox = { width: d.width * slot.dpr, height: d.height * slot.dpr };
      const main = await emit(
        buffer,
        join(OUT_DIR, kind, name),
        desktopBox,
        "cover",
      );

      let mobile = null;
      if (slot.artDirected) {
        const m = slot.mobile;
        mobile = await emit(
          buffer,
          join(OUT_DIR, kind, `${name}-mobile`),
          { width: m.width * slot.dpr, height: m.height * slot.dpr },
          "cover",
        );
      }

      const worst = Math.max(main.avif, mobile?.avif ?? 0);
      const ok = kb(worst) <= slot.maxKB;
      if (!ok) breached++;
      totalAvif += main.avif + (mobile?.avif ?? 0);

      manifest[`${kind}/${name}`] = {
        kind,
        stamp,
        src: `/images/${kind}/${name}.avif`,
        fallback: `/images/${kind}/${name}.webp`,
        ...(mobile
          ? {
              mobileSrc: `/images/${kind}/${name}-mobile.avif`,
              mobileFallback: `/images/${kind}/${name}-mobile.webp`,
            }
          : {}),
        width: desktopBox.width,
        height: desktopBox.height,
        vector: false,
      };

      rows.push([
        `${kind}/${name}`,
        `${desktopBox.width}x${desktopBox.height}${mobile ? " +mobile" : ""}`,
        `${kb(main.avif)} KB avif / ${kb(main.webp)} KB webp`,
        ok ? "pass" : `OVER ${slot.maxKB} KB`,
      ]);
    }
  }

  if (!CHECK_ONLY) {
    await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  const w = [
    Math.max(6, ...rows.map((r) => r[0].length)),
    Math.max(6, ...rows.map((r) => r[1].length)),
    Math.max(6, ...rows.map((r) => r[2].length)),
  ];
  console.log("");
  for (const r of rows) {
    console.log(
      `  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}  ${r[3]}`,
    );
  }

  const budget = 562;
  console.log("");
  console.log(`  ${rows.length} image(s), ${skipped} cached`);
  console.log(`  total primary payload: ${kb(totalAvif)} KB / ${budget} KB budget`);
  if (kb(totalAvif) > budget) {
    console.log(`  OVER BUDGET by ${kb(totalAvif) - budget} KB (spec §13)`);
    breached++;
  }
  if (CHECK_ONLY) console.log("  --check: nothing written");
  console.log("");

  process.exit(breached > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
