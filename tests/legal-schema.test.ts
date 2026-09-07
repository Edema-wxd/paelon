import { describe, expect, it } from "vitest";

import termsJson from "@/content/legal/terms.json";
import { legalDocumentSchema } from "@/lib/validation/legal";

/** A minimal valid skeleton, cloned per test so cases cannot leak into each other. */
function skeleton() {
  return {
    slug: "terms",
    title: "Terms of Service",
    published: false,
    effective_date: null,
    sections: [
      { id: "about-these-terms", heading: "About these terms", body: [] },
    ],
  };
}

describe("legalDocumentSchema", () => {
  it("accepts an unpublished skeleton with empty bodies", () => {
    expect(legalDocumentSchema.safeParse(skeleton()).success).toBe(true);
  });

  it("accepts a published document with bodies and an effective date", () => {
    const doc = {
      ...skeleton(),
      published: true,
      effective_date: "2026-01-01",
      sections: [
        {
          id: "about-these-terms",
          heading: "About these terms",
          body: ["Text."],
        },
      ],
    };
    expect(legalDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("defaults published to false and body to an empty array", () => {
    const parsed = legalDocumentSchema.parse({
      slug: "terms",
      title: "Terms of Service",
      sections: [{ id: "about-these-terms", heading: "About these terms" }],
    });
    expect(parsed.published).toBe(false);
    expect(parsed.sections[0]?.body).toEqual([]);
  });

  // The guard that stops a skeleton going live. This is the whole point of the
  // schema: publishing must be impossible until counsel has filled it in.
  it("rejects publishing while a section body is empty, naming the section", () => {
    const result = legalDocumentSchema.safeParse({
      ...skeleton(),
      published: true,
      effective_date: "2026-01-01",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("about-these-terms");
  });

  it("rejects publishing without an effective date", () => {
    const result = legalDocumentSchema.safeParse({
      ...skeleton(),
      published: true,
      sections: [
        {
          id: "about-these-terms",
          heading: "About these terms",
          body: ["Text."],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["effective_date"]);
  });

  it("rejects a document with no sections", () => {
    expect(
      legalDocumentSchema.safeParse({ ...skeleton(), sections: [] }).success,
    ).toBe(false);
  });

  it("rejects a non-slug section id, so anchors stay linkable", () => {
    const result = legalDocumentSchema.safeParse({
      ...skeleton(),
      sections: [
        { id: "About These Terms", heading: "About these terms", body: [] },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("content/legal/terms.json", () => {
  it("parses, so a malformed file fails the build rather than the page", () => {
    expect(legalDocumentSchema.safeParse(termsJson).success).toBe(true);
  });

  it("ships unpublished, since the draft is still with counsel (spec §18)", () => {
    expect(legalDocumentSchema.parse(termsJson).published).toBe(false);
  });

  it("has unique section ids", () => {
    const ids = legalDocumentSchema.parse(termsJson).sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
