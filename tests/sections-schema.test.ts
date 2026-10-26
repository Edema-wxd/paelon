import { describe, expect, it } from "vitest";

import { sectionSchema, sectionsSchema } from "@/lib/validation/sections";

const ID = "0b3c7c64-6d0d-4a52-9f43-0c1a6bd1e2f1";
const messages = (input: unknown) => {
  const result = sectionSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("section blocks", () => {
  it("accepts each kind in its valid shape", () => {
    expect(messages({ kind: "text", data: { body: "## A\n\nText." } })).toEqual([]);
    expect(messages({ kind: "text", data: { heading: "What to expect", body: "Text." } })).toEqual([]);
    expect(messages({ kind: "image", data: { mediaId: ID, caption: "" } })).toEqual([]);
    expect(messages({ kind: "gallery", data: { heading: "Our wards", mediaIds: [ID] } })).toEqual([]);
    expect(messages({ kind: "cta", data: { heading: "Book a visit", buttonLabel: "Book", href: "/book?service=paediatrics" } })).toEqual([]);
    expect(messages({ kind: "cta", data: { heading: "Call us", buttonLabel: "Call", href: "tel:+2349125120020" } })).toEqual([]);
  });

  it("drops a blank optional heading rather than storing it", () => {
    const result = sectionSchema.parse({ kind: "text", data: { heading: "  ", body: "Text." } });
    expect(result.kind === "text" && result.data.heading).toBeUndefined();
  });

  it("refuses an empty text block, an image inside a sentence, and a skipped heading", () => {
    expect(messages({ kind: "text", data: { body: "  " } })[0]).toMatch(/Write the text/);
    expect(messages({ kind: "text", data: { body: `See ![x](media:${ID}) here.` } })[0]).toMatch(/line of its own/);
    expect(messages({ kind: "text", data: { body: "## A\n\n#### B" } })[0]).toMatch(/cannot skip/);
  });

  it("refuses a gallery with no images or no heading", () => {
    expect(messages({ kind: "gallery", data: { heading: "X", mediaIds: [] } })[0]).toMatch(/at least one image/);
    expect(messages({ kind: "gallery", data: { heading: "", mediaIds: [ID] } })).toHaveLength(1);
  });

  it("refuses unsafe call-to-action links", () => {
    for (const href of ["javascript:alert(1)", "//evil.example", "http://plain.example", "data:text/html,x"]) {
      expect(messages({ kind: "cta", data: { heading: "H", buttonLabel: "Go", href } })).toHaveLength(1);
    }
  });

  it("refuses an unknown kind and caps the page at 40 blocks", () => {
    expect(messages({ kind: "video", data: {} }).length).toBeGreaterThan(0);
    const many = Array.from({ length: 41 }, () => ({ kind: "text", data: { body: "x" } }));
    expect(sectionsSchema.safeParse(many).success).toBe(false);
  });
});
