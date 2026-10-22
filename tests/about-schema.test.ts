import { describe, expect, it } from "vitest";

import { aboutContentSchema, aboutFormSchema } from "@/lib/validation/about";

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

/**
 * `/admin/about` submissions.
 *
 * Same guards, applied to what a form sends: strings for everything, an absent
 * key for an unticked checkbox. The pair matters — the screen is now the only
 * way this copy changes, so a rule the form schema skips is a rule that does
 * not exist.
 */
describe("aboutFormSchema", () => {
  /** What the form posts when every section is written and the page is live. */
  function submission(overrides: Record<string, string> = {}) {
    return {
      published: "on",
      intro: "One sentence.",
      founding_story: "The story.",
      mission: "The mission.",
      vision: "The vision.",
      value_proposition: "The offer.",
      motto: "A motto.",
      esg: "The certification.",
      ...overrides,
    };
  }

  it("accepts a fully written, published submission", () => {
    const parsed = aboutFormSchema.safeParse(submission());
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.published).toBe(true);
    expect(parsed.success && parsed.data.placeholder).toBe(false);
  });

  it("accepts an empty draft — every section is optional at rest", () => {
    const parsed = aboutFormSchema.safeParse({
      intro: "",
      founding_story: "",
      mission: "",
      vision: "",
      value_proposition: "",
      motto: "",
      esg: "",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.published).toBe(false);
    expect(parsed.success && parsed.data.intro).toBeNull();
  });

  it("stores a cleared section as null, not an empty string", () => {
    // An empty string would make the template render a heading with nothing
    // under it; null is what makes it skip the section.
    const draft: Record<string, string> = submission({ esg: "  " });
    delete draft.published;
    const parsed = aboutFormSchema.safeParse(draft);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.esg).toBeNull();
  });

  it("reads an unticked checkbox — an absent key — as false", () => {
    // A browser omits an unticked box entirely, so this is the shape every
    // draft save arrives in.
    const draft: Record<string, string> = submission();
    delete draft.published;
    const parsed = aboutFormSchema.safeParse(draft);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.published).toBe(false);
  });

  it("refuses to publish with a missing section", () => {
    const parsed = aboutFormSchema.safeParse(
      submission({ founding_story: "", mission: "" }),
    );

    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.message).toMatch(
      /founding_story, mission/,
    );
  });

  it("refuses to publish copy still marked as a draft", () => {
    const parsed = aboutFormSchema.safeParse({
      ...submission(),
      placeholder: "on",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.message).toMatch(
      /placeholder/i,
    );
  });

  it("rejects a motto longer than the database allows", () => {
    const parsed = aboutFormSchema.safeParse(
      submission({ motto: "x".repeat(201) }),
    );
    expect(parsed.success).toBe(false);
  });
});
