import { describe, expect, it } from "vitest";

import { planHmoSync, type HmoSyncRow } from "@/lib/db/hmo-sync-plan";
import { hmoSeedSchema } from "@/lib/validation/seed";

const seed = (slug: string, name: string, order: number, aliases: string[] = []) =>
  hmoSeedSchema.parse({ slug, name, order, aliases });

const row = (
  slug: string,
  name: string,
  order: number,
  extra: Partial<HmoSyncRow> = {},
): HmoSyncRow => ({
  id: `id-${slug}`,
  slug,
  name,
  aliases: [],
  order,
  deletedAt: null,
  ...extra,
});

describe("planHmoSync", () => {
  it("inserts slugs the database does not have", () => {
    const plan = planHmoSync([seed("allianz", "Allianz", 4)], []);
    expect(plan.insert.map((s) => s.slug)).toEqual(["allianz"]);
    expect(plan.update).toEqual([]);
  });

  it("patches only the name, aliases and order that differ", () => {
    const plan = planHmoSync(
      [seed("cigna", "Vanbreda/Cigna", 1, ["Vanbreda", "Cigna"])],
      [row("cigna", "Cigna", 4)],
    );
    expect(plan.update).toEqual([
      {
        id: "id-cigna",
        slug: "cigna",
        patch: { name: "Vanbreda/Cigna", aliases: ["Vanbreda", "Cigna"], order: 1 },
      },
    ]);
  });

  it("leaves a matching row alone", () => {
    const plan = planHmoSync([seed("avon", "Avon", 21)], [row("avon", "Avon", 21)]);
    expect(plan.unchanged).toEqual(["avon"]);
    expect(plan.update).toEqual([]);
  });

  it("never revives a row soft-deleted in the admin panel", () => {
    const plan = planHmoSync(
      [seed("henner", "Henner", 8)],
      [row("henner", "Henner", 8, { deletedAt: new Date() })],
    );
    expect(plan.skippedDeleted).toEqual(["henner"]);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
  });

  it("reports live rows missing from the seed without removing them", () => {
    const plan = planHmoSync(
      [],
      [row("other", "Other", 1), row("gone", "Gone", 2, { deletedAt: new Date() })],
    );
    expect(plan.notInSeed).toEqual(["other"]);
  });
});
