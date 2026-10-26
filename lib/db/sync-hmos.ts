import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { closePool, dbTx } from "@/lib/db/client";
import { planHmoSync, type HmoSyncPlan } from "@/lib/db/hmo-sync-plan";
import { hmos } from "@/lib/db/schema";
import { hmoSeedSchema } from "@/lib/validation/seed";

/**
 * Bring the `hmos` table in line with `seed/hmos.json`, and nothing else.
 *
 * `db:seed` upserts every content table and would overwrite admin edits
 * (About copy, HMO coverage notes) on the shared Preview/Production database.
 * This touches only `hmos`, and see `planHmoSync` for what it will and will
 * not change there. Dry run by default; `--apply` writes in one transaction.
 *
 *   node --env-file=.env.local ./node_modules/.bin/tsx lib/db/sync-hmos.ts
 *   node --env-file=.env.local ./node_modules/.bin/tsx lib/db/sync-hmos.ts --apply
 */

const APPLY = process.argv.includes("--apply");

function readSeeds() {
  const raw: unknown = JSON.parse(
    readFileSync(join(process.cwd(), "seed", "hmos.json"), "utf8"),
  );
  return z.array(hmoSeedSchema).parse(raw);
}

function describe(plan: HmoSyncPlan): string {
  const lines: string[] = [];
  const section = (title: string, items: string[]) => {
    lines.push(`${title} (${items.length})`);
    for (const item of items) lines.push(`  ${item}`);
  };

  section(
    "insert",
    plan.insert.map((s) => `${s.slug}  "${s.name}"  order ${s.order}`),
  );
  section(
    "update",
    plan.update.map((u) => `${u.slug}  ${JSON.stringify(u.patch)}`),
  );
  section("unchanged", plan.unchanged);
  section("skipped, soft-deleted in admin", plan.skippedDeleted);
  section("in database but not in seed, left alone", plan.notInSeed);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const db = dbTx();
  const seeds = readSeeds();
  const rows = await db
    .select({
      id: hmos.id,
      slug: hmos.slug,
      name: hmos.name,
      aliases: hmos.aliases,
      order: hmos.order,
      deletedAt: hmos.deletedAt,
    })
    .from(hmos);

  const plan = planHmoSync(seeds, rows);
  process.stdout.write(`${describe(plan)}\n\n`);

  if (!APPLY) {
    process.stdout.write("Dry run: nothing written. Re-run with --apply.\n");
    return;
  }
  if (plan.insert.length === 0 && plan.update.length === 0) {
    process.stdout.write("Already in sync: nothing to write.\n");
    return;
  }

  await db.transaction(async (tx) => {
    if (plan.insert.length > 0) {
      await tx.insert(hmos).values(
        plan.insert.map((s) => ({
          slug: s.slug,
          name: s.name,
          aliases: s.aliases,
          order: s.order,
          published: s.published,
          coverageNotes: s.coverage_notes,
          copayApplies: s.copay_applies,
          planNotes: s.plan_notes,
        })),
      );
    }
    for (const { id, patch } of plan.update) {
      await tx
        .update(hmos)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(hmos.id, id));
    }
  });

  process.stdout.write(
    `Applied: ${plan.insert.length} inserted, ${plan.update.length} updated.\n`,
  );
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        event: "db.sync_hmos.failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        // Drizzle wraps driver errors as "Failed query: …"; the reason the
        // query failed (connection, auth, missing column) is on `cause`.
        cause:
          error instanceof Error && error.cause instanceof Error
            ? error.cause.message
            : undefined,
      })}\n`,
    );
    await closePool();
    process.exit(1);
  });
