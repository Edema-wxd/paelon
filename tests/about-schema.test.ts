import { describe, expect, it } from "vitest";

import aboutJson from "@/content/about.json";
import { aboutContentSchema } from "@/lib/validation/about";

/**
 * The About page's content contract.
 *
 * The guards are the same shape as the legal documents': an empty page is a
 * legitimate state, and publishing one is not. These are the tests that stop a
 * skeleton About page being served `index` with nothing on it.
 */

/** A page with every section written. Cloned per test. */
function filled() {
  return {
    published: true,
    placeholder: false,
    intro: "One sentence.",
    founding_story: "The story.",
    mission: "The mission.",
    vision: "The vision.",
    value_proposition: "The offer.",
    motto: "A motto.",
    esg: "The certification.",
  };
}

describe("aboutContentSchema", () => {
  it("accepts the shipped file", () => {
    expect(aboutContentSchema.safeParse(aboutJson).success).toBe(true);
  });

  it("accepts an unpublished page with every field empty", () => {
    const parsed = aboutContentSchema.safeParse({});
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.published).toBe(false);
    expect(parsed.success && parsed.data.founding_story).toBeNull();
  });

  it("accepts a published page with every section written", () => {
    expect(aboutContentSchema.safeParse(filled()).success).toBe(true);
  });

  it("accepts a published page with no motto and no ESG block", () => {
    // Genuinely optional: a hospital may have neither, and a page missing them
    // is still an About page.
    const parsed = aboutContentSchema.safeParse({
      ...filled(),
      motto: null,
      esg: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses to publish with a missing section", () => {
    const parsed = aboutContentSchema.safeParse({
      ...filled(),
      founding_story: null,
      mission: null,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.message).toMatch(
      /founding_story, mission/,
    );
  });

  it("refuses to publish unreviewed placeholder copy", () => {
    const parsed = aboutContentSchema.safeParse({
      ...filled(),
      placeholder: true,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.message).toMatch(
      /placeholder/i,
    );
  });

  it("treats whitespace-only copy as absent rather than written", () => {
    // Otherwise a stray space in the JSON would satisfy the publish guard and
    // render an empty section heading.
    const parsed = aboutContentSchema.safeParse({ ...filled(), mission: "   " });
    expect(parsed.success).toBe(false);
  });
});
