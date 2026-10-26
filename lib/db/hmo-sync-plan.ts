import type { HmoSeed } from "@/lib/validation/seed";

/** The columns of an `hmos` row the sync reads. */
export interface HmoSyncRow {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  order: number;
  deletedAt: Date | null;
}

/** Fields the sync is allowed to change on an existing row. */
export interface HmoSyncPatch {
  name?: string;
  aliases?: string[];
  order?: number;
}

export interface HmoSyncPlan {
  insert: HmoSeed[];
  update: { id: string; slug: string; patch: HmoSyncPatch }[];
  unchanged: string[];
  /** Soft-deleted in the admin panel. Deleting was a decision; not reversed. */
  skippedDeleted: string[];
  /** In the database but not in the seed file. Reported, never removed. */
  notInSeed: string[];
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Work out what `sync-hmos.ts` would write, without touching the database.
 *
 * Unlike `db:seed`, this never overwrites what the admin panel owns: an
 * existing row only ever has its name, aliases and order brought in line with
 * the seed. Coverage notes, co-pay, plan notes, published state, logo and
 * branch links are left exactly as they are, and nothing is deleted.
 */
export function planHmoSync(
  seeds: HmoSeed[],
  rows: HmoSyncRow[],
): HmoSyncPlan {
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const seedSlugs = new Set(seeds.map((s) => s.slug));

  const plan: HmoSyncPlan = {
    insert: [],
    update: [],
    unchanged: [],
    skippedDeleted: [],
    notInSeed: rows
      .filter((r) => !seedSlugs.has(r.slug) && r.deletedAt === null)
      .map((r) => r.slug),
  };

  for (const seed of seeds) {
    const row = bySlug.get(seed.slug);
    if (!row) {
      plan.insert.push(seed);
      continue;
    }
    if (row.deletedAt !== null) {
      plan.skippedDeleted.push(seed.slug);
      continue;
    }

    const patch: HmoSyncPatch = {};
    if (row.name !== seed.name) patch.name = seed.name;
    if (!sameList(row.aliases, seed.aliases)) patch.aliases = seed.aliases;
    if (row.order !== seed.order) patch.order = seed.order;

    if (Object.keys(patch).length === 0) plan.unchanged.push(seed.slug);
    else plan.update.push({ id: row.id, slug: seed.slug, patch });
  }

  return plan;
}
