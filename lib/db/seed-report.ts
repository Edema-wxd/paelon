import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { SEED_FILES, TODO_SEED } from "@/lib/validation/seed";

/**
 * `TODO(seed)` scanner (backend spec §5).
 *
 * Master spec §5 and §16 forbid fabricating content about Paelon — services,
 * awards, patient stories, wait times. This makes the resulting gaps visible
 * and countable instead of leaving them to be noticed (or quietly filled in).
 *
 * Run standalone with `npm run seed:report`; also printed by `npm run db:seed`.
 */

export interface SeedGap {
  file: string;
  slug: string;
  field: string;
  /** True for a field that is null/empty rather than literally TODO(seed). */
  empty: boolean;
}

const SEED_DIR = join(process.cwd(), "seed");

/** Fields whose emptiness is expected and not worth reporting. */
const IGNORED_FIELDS = new Set(["published", "order", "slug", "id"]);

/** Scan every seed file for unfilled content. */
export function collectSeedGaps(): SeedGap[] {
  const gaps: SeedGap[] = [];

  for (const { file } of SEED_FILES) {
    const path = join(SEED_DIR, file);
    if (!existsSync(path)) continue;

    let records: unknown;
    try {
      records = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      gaps.push({ file, slug: "(file)", field: "invalid JSON", empty: false });
      continue;
    }

    if (!Array.isArray(records)) continue;

    for (const record of records) {
      if (!record || typeof record !== "object") continue;
      const row = record as Record<string, unknown>;
      const slug = typeof row.slug === "string" ? row.slug : "(no slug)";

      for (const [field, value] of Object.entries(row)) {
        if (IGNORED_FIELDS.has(field)) continue;

        if (containsTodo(value)) {
          gaps.push({ file, slug, field, empty: false });
        } else if (isEmpty(value)) {
          gaps.push({ file, slug, field, empty: true });
        }
      }
    }
  }

  return gaps;
}

function containsTodo(value: unknown): boolean {
  if (typeof value === "string") return value.includes(TODO_SEED);
  if (Array.isArray(value)) return value.some(containsTodo);
  return false;
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Render the report as text, grouped file → record → field. */
export function formatSeedReport(gaps: SeedGap[]): string {
  if (gaps.length === 0) {
    return "No outstanding seed content gaps.";
  }

  const byFile = new Map<string, Map<string, SeedGap[]>>();

  for (const gap of gaps) {
    const bySlug = byFile.get(gap.file) ?? new Map<string, SeedGap[]>();
    const list = bySlug.get(gap.slug) ?? [];
    list.push(gap);
    bySlug.set(gap.slug, list);
    byFile.set(gap.file, bySlug);
  }

  const lines: string[] = [
    "Outstanding seed content gaps",
    "=============================",
    "",
    "Nothing here has been invented — master spec §5 forbids fabricating",
    "content about Paelon. Each line is a field awaiting real material.",
    "",
  ];

  for (const [file, bySlug] of [...byFile].sort()) {
    lines.push(file);
    for (const [slug, list] of [...bySlug].sort()) {
      lines.push(`  ${slug}`);
      for (const gap of list) {
        lines.push(`    ${gap.field}${gap.empty ? "" : "  (TODO(seed))"}`);
      }
    }
    lines.push("");
  }

  const todoCount = gaps.filter((g) => !g.empty).length;
  lines.push(
    `${gaps.length} gap(s) across ${byFile.size} file(s); ${todoCount} explicit TODO(seed) marker(s).`,
  );

  return lines.join("\n");
}

/** CLI entry point. Reports only — never writes. */
function main(): void {
  process.stdout.write(`${formatSeedReport(collectSeedGaps())}\n`);
}

// `npm run seed:report` executes this file directly; importing it does not.
if (process.argv[1]?.includes("seed-report")) {
  main();
}
