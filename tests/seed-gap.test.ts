import { describe, expect, it } from "vitest";

import { isSeedGap } from "@/lib/content";

/**
 * The sentinel guard is the only thing standing between an unwritten seed field
 * and the words "TODO(seed)" appearing on a live hospital page, so it is tested
 * rather than trusted.
 */
describe("isSeedGap", () => {
  it("treats the seed sentinel as a gap", () => {
    expect(isSeedGap("TODO(seed)")).toBe(true);
  });

  it("ignores surrounding whitespace and casing", () => {
    expect(isSeedGap("  TODO(seed)  ")).toBe(true);
    expect(isSeedGap("todo(seed)")).toBe(true);
    expect(isSeedGap("Todo(Seed)")).toBe(true);
  });

  it("treats absent and empty values as gaps", () => {
    expect(isSeedGap(null)).toBe(true);
    expect(isSeedGap(undefined)).toBe(true);
    expect(isSeedGap("")).toBe(true);
    expect(isSeedGap("   ")).toBe(true);
  });

  it("does not swallow real copy that merely mentions the marker", () => {
    // A sentence about the sentinel is real content someone wrote; only a field
    // that is nothing but the marker counts as unwritten.
    expect(isSeedGap("We use TODO(seed) to mark unwritten fields.")).toBe(false);
    expect(isSeedGap("TODO(seed) — ask Francis")).toBe(false);
  });

  it("passes ordinary content through", () => {
    expect(isSeedGap("Antenatal care from booking through delivery.")).toBe(false);
    expect(isSeedGap("0")).toBe(false);
  });
});
