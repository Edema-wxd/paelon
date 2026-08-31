import { describe, expect, it } from "vitest";

import type { Hmo } from "@/lib/content";
import { searchHmos } from "@/lib/hmo-search";

function hmo(name: string, order: number, aliases: string[] = []): Hmo {
  return {
    id: `id-${order}`,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    aliases,
    logo: null,
    coverage_notes: null,
    copay_applies: false,
    order,
    published: true,
  };
}

/** The four providers actually seeded for launch. */
const SEEDED: Hmo[] = [
  hmo("AXA Mansard", 1),
  hmo("Leadway", 2),
  hmo("Avon", 3),
  hmo("Cigna", 4),
];

const names = (query: string, list: Hmo[] = SEEDED) =>
  searchHmos(list, query).map((h) => h.name);

describe("searchHmos", () => {
  it("returns nothing for an empty or whitespace query", () => {
    expect(names("")).toEqual([]);
    expect(names("   ")).toEqual([]);
  });

  it("matches the canonical name exactly and case-insensitively", () => {
    expect(names("AXA Mansard")).toEqual(["AXA Mansard"]);
    expect(names("axa mansard")).toEqual(["AXA Mansard"]);
    expect(names("CIGNA")).toEqual(["Cigna"]);
  });

  it("matches on a prefix, so the first keystrokes work", () => {
    expect(names("a")).toContain("AXA Mansard");
    expect(names("ci")).toEqual(["Cigna"]);
    expect(names("lead")).toEqual(["Leadway"]);
  });

  // The regression this module was written for: both strings are readable
  // from the logo strip rendered directly above the search input.
  it("matches names as printed on the providers' own logos", () => {
    expect(names("Leadway Health")).toEqual(["Leadway"]);
    expect(names("Avon HMO")).toEqual(["Avon"]);
    expect(names("avon hmo")).toEqual(["Avon"]);
  });

  it("ignores punctuation, extra whitespace and diacritics", () => {
    expect(names("AXA  Mansard")).toEqual(["AXA Mansard"]);
    expect(names("axa-mansard")).toEqual(["AXA Mansard"]);
    expect(names("  cigna  ")).toEqual(["Cigna"]);
  });

  it("matches a distinctive token anywhere in the name", () => {
    expect(names("mansard")).toEqual(["AXA Mansard"]);
  });

  it("tolerates typos in tokens long enough to disambiguate", () => {
    expect(names("mansrd")).toEqual(["AXA Mansard"]);
    expect(names("mansrad")).toEqual(["AXA Mansard"]);
    expect(names("leadwya")).toEqual(["Leadway"]);
  });

  it("does not match a short query inside the middle of a name", () => {
    // "a" occurs inside "leadway" and "cigna"; only real prefixes should hit.
    expect(names("a")).toEqual(["AXA Mansard", "Avon"]);
  });

  it("does not fuzzy-match very short tokens into everything", () => {
    // "avo" must not reach "Cigna" or "AXA Mansard" on a single edit.
    expect(names("avo")).toEqual(["Avon"]);
  });

  it("requires every query token to match, so mixed names find nothing", () => {
    expect(names("axa cigna")).toEqual([]);
  });

  it("returns nothing for a provider that is not seeded", () => {
    expect(names("Hygeia")).toEqual([]);
    expect(names("Reliance")).toEqual([]);
  });

  it("searches aliases alongside the canonical name", () => {
    const list = [hmo("Leadway", 1, ["Leadway Assurance"])];
    expect(names("Leadway Assurance", list)).toEqual(["Leadway"]);
  });

  it("ranks an exact name hit above a partial one", () => {
    const list = [hmo("Avon Plus", 1), hmo("Avon", 2)];
    expect(names("avon", list)[0]).toBe("Avon");
  });

  it("falls back to seeded order when scores tie", () => {
    const list = [hmo("Alpha Care", 1), hmo("Alpha Health", 2)];
    expect(names("alpha", list)).toEqual(["Alpha Care", "Alpha Health"]);
  });

  it("still matches when the query is nothing but generic tokens", () => {
    // "hmo" carries no signal, but returning nothing would read as broken.
    const list = [hmo("Avon HMO", 1)];
    expect(names("hmo", list)).toEqual(["Avon HMO"]);
  });
});
