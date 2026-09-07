#!/usr/bin/env node
/**
 * Push editorial images to UploadThing from the command line.
 *
 * Phase 1 has no admin panel, but the content tables already carry image
 * columns (`blog_posts.hero_image`, `doctors.headshot`, `locations.hero_image`
 * and `gallery_images`, `awards.certificate_image`, `hmos.logo`,
 * `testimonials.avatar`). This is how a file gets a CDN URL to put in them
 * before the Phase 2 editor exists.
 *
 * It prints the URL and writes nothing to the database — paste the URL into the
 * matching field in `/seed/*.json` and re-run `npm run db:seed`. Keeping the
 * write manual means an upload can never quietly change published content.
 *
 * Site design assets do NOT belong here. Those are committed under `assets/`
 * and built by `scripts/optimize-images.mjs` — see lib/images.ts.
 *
 * Usage:
 *   npm run upload -- path/to/image.webp [more.png ...]
 *
 * Requires UPLOADTHING_TOKEN in .env.local.
 */
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import process from "node:process";

import { UTApi, UTFile } from "uploadthing/server";

/** Spec §10: jpeg, png and webp only. */
const ALLOWED = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

/** Spec §10: 5 MB per image. */
const MAX_BYTES = 5 * 1024 * 1024;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const paths = process.argv.slice(2);

if (paths.length === 0) {
  fail("Usage: npm run upload -- <file> [file ...]");
}

if (!process.env.UPLOADTHING_TOKEN) {
  fail(
    "UPLOADTHING_TOKEN is not set. Add it to .env.local, then run with:\n" +
      "  node --env-file=.env.local scripts/upload-asset.mjs <file>",
  );
}

const files = [];

for (const path of paths) {
  const extension = extname(path).toLowerCase();
  const type = ALLOWED.get(extension);

  if (!type) {
    fail(`${path}: only ${[...ALLOWED.keys()].join(", ")} are allowed (spec §10).`);
  }

  let bytes;
  try {
    bytes = await readFile(path);
  } catch (error) {
    fail(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (bytes.byteLength > MAX_BYTES) {
    // Spec §10 says to transcode oversized uploads server-side. There is no
    // server here, and silently re-encoding someone's master would be worse
    // than refusing it — `npm run images` is the resizing tool.
    fail(
      `${path}: ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB exceeds the 5 MB limit. Resize it first.`,
    );
  }

  files.push(new UTFile([bytes], basename(path), { type }));
}

const api = new UTApi();
const results = await api.uploadFiles(files);

let failed = 0;

for (const [index, result] of results.entries()) {
  const path = paths[index];

  if (result.error) {
    failed += 1;
    process.stderr.write(
      `${JSON.stringify({ level: "error", event: "upload.failed", path, message: result.error.message })}\n`,
    );
    continue;
  }

  process.stdout.write(
    `${JSON.stringify({ level: "info", event: "upload.complete", path, key: result.data.key, url: result.data.ufsUrl })}\n`,
  );
}

process.exit(failed > 0 ? 1 : 0);
