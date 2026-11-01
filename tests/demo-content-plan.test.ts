import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BRANCH_COUNT_CLAUSE,
  PREVIEW_FIXTURES,
  fixBranchCount,
} from "@/lib/db/demo-content-plan";

const seed = (file: string): unknown =>
  JSON.parse(readFileSync(join(process.cwd(), "seed", file), "utf8"));

describe("fixBranchCount", () => {
  it("drops the branch count and keeps the services link", () => {
    const body =
      "The hospital opened in April 2010. " +
      BRANCH_COUNT_CLAUSE +
      "[general practice and fertility](/services).";
    expect(fixBranchCount(body)).toEqual({
      kind: "reworded",
      body:
        "The hospital opened in April 2010. We now see patients across " +
        "[general practice and fertility](/services).",
    });
  });

  it("reports an edited mention instead of guessing at it", () => {
    expect(fixBranchCount("Our three branches in Lagos are open daily.")).toEqual({
      kind: "edited",
    });
  });

  it("leaves a body without the claim alone", () => {
    expect(fixBranchCount("We see patients at Victoria Island.")).toEqual({
      kind: "absent",
    });
  });
});

describe("seed files match the database fix", () => {
  it("keeps every preview fixture unpublished, so a re-seed cannot bring one back", () => {
    const rows = [
      ...(seed("authors.json") as { slug: string; published?: boolean }[]),
      ...(seed("blog-posts.json") as { slug: string; published?: boolean }[]),
      ...(seed("testimonials.json") as { slug: string; published?: boolean }[]),
    ];
    for (const fixture of PREVIEW_FIXTURES) {
      const row = rows.find((r) => r.slug === fixture.slug);
      expect(row, fixture.slug).toBeDefined();
      expect(row?.published, fixture.slug).toBe(false);
    }
  });

  it("seeds the About story without the branch count", () => {
    const about = seed("about.json") as { founding_story: string };
    expect(fixBranchCount(about.founding_story).kind).toBe("absent");
  });
});
