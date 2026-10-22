import { describe, expect, it } from "vitest";

import { slugify } from "@/lib/admin/resource-config";
import { AWARD_CERTIFICATE, AWARD_LOGO, awardSchema } from "@/lib/admin/resources/awards";
import { faqSchema } from "@/lib/admin/resources/faqs";

/**
 * Accept and reject cases for the two schemas the CRUD kit is proven on
 * (CLAUDE.md testing floor: every form submission schema, both directions).
 *
 * These are the schemas the *client* and the *server* both parse with, so a
 * case here covers both sides at once. They are parsed against the shape
 * `FormData` actually produces — strings throughout, checkboxes as `"on"` or
 * absent — because a schema that only passes when handed tidy JavaScript values
 * is a schema that has never met a form.
 */

const MEDIA_ID = "3f7c1f4e-5a8b-4c2d-9e10-0b6a2d3c4e5f";

/**
 * Read a field whose name comes from a config constant (`AWARD_LOGO.id` and
 * friends). The schema's output type has literal keys, so an index by a
 * `string` needs widening — the constants are the source of truth for those
 * names, and hard-coding them here would be the thing that silently rots.
 */
function field(parsed: unknown, name: string): unknown {
  return (parsed as Record<string, unknown>)[name];
}

const validFaq = {
  question: "Do I need an appointment for the walk-in clinic?",
  answer: "No. Walk in during opening hours and you will be seen in turn.",
  category: "booking",
  slug: "do-i-need-an-appointment",
  order: "3",
  published: "on",
};

describe("faqSchema", () => {
  it("accepts a complete submission", () => {
    const parsed = faqSchema.parse(validFaq);
    expect(parsed.category).toBe("booking");
    expect(parsed.order).toBe(3);
    expect(parsed.published).toBe(true);
  });

  it("treats an absent published checkbox as a draft", () => {
    const draft = { ...validFaq };
    delete (draft as Partial<typeof validFaq>).published;
    expect(faqSchema.parse(draft).published).toBe(false);
  });

  it("defaults an empty order to 0", () => {
    expect(faqSchema.parse({ ...validFaq, order: "" }).order).toBe(0);
  });

  it("trims surrounding whitespace", () => {
    const parsed = faqSchema.parse({ ...validFaq, question: "  Spaced out?  " });
    expect(parsed.question).toBe("Spaced out?");
  });

  it("rejects an empty question", () => {
    const result = faqSchema.safeParse({ ...validFaq, question: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects an empty answer", () => {
    expect(faqSchema.safeParse({ ...validFaq, answer: "" }).success).toBe(false);
  });

  it("rejects a category that is not in the enum", () => {
    expect(faqSchema.safeParse({ ...validFaq, category: "billing" }).success).toBe(
      false,
    );
  });

  it("rejects a slug that is not kebab-case", () => {
    for (const slug of ["Not Kebab", "trailing-", "double--hyphen", "Ünicode"]) {
      expect(faqSchema.safeParse({ ...validFaq, slug }).success).toBe(false);
    }
  });

  it("rejects a non-numeric order", () => {
    expect(faqSchema.safeParse({ ...validFaq, order: "first" }).success).toBe(false);
  });

  it("rejects a negative order", () => {
    expect(faqSchema.safeParse({ ...validFaq, order: "-1" }).success).toBe(false);
  });

  it("reports the field name, so the form can highlight it", () => {
    const result = faqSchema.safeParse({ ...validFaq, slug: "Not Kebab" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["slug"]);
  });
});

const validAward = {
  name: "Best Private Hospital",
  awardingBody: "Nigerian Healthcare Excellence Awards",
  year: "2025",
  description: "Recognised for paediatric outcomes across three branches.",
  externalLink: "",
  slug: "best-private-hospital",
  order: "0",
  published: "on",
  [AWARD_LOGO.id]: "",
  [AWARD_LOGO.alt]: "",
  [AWARD_CERTIFICATE.id]: "",
  [AWARD_CERTIFICATE.alt]: "",
};

describe("awardSchema", () => {
  it("accepts a submission with no images", () => {
    const parsed = awardSchema.parse(validAward);
    expect(parsed.year).toBe(2025);
    expect(field(parsed, AWARD_LOGO.id)).toBeNull();
    expect(parsed.externalLink).toBeNull();
  });

  it("accepts an image with alt text", () => {
    const parsed = awardSchema.parse({
      ...validAward,
      [AWARD_LOGO.id]: MEDIA_ID,
      [AWARD_LOGO.alt]: "The awarding body's crest",
    });
    expect(field(parsed, AWARD_LOGO.id)).toBe(MEDIA_ID);
  });

  it("accepts an image marked decorative with no alt text", () => {
    const parsed = awardSchema.parse({
      ...validAward,
      [AWARD_LOGO.id]: MEDIA_ID,
      [AWARD_LOGO.alt]: "",
      [AWARD_LOGO.decorative]: "on",
    });
    expect(field(parsed, AWARD_LOGO.alt)).toBe("");
  });

  it("accepts an https external link", () => {
    const parsed = awardSchema.parse({
      ...validAward,
      externalLink: "https://example.org/awards/2025",
    });
    expect(parsed.externalLink).toBe("https://example.org/awards/2025");
  });

  // The rule the image field exists for: a shipped image without alt text is a
  // blocking accessibility failure, so it must not be reachable through a save.
  it("rejects an image with blank alt text that is not marked decorative", () => {
    const result = awardSchema.safeParse({
      ...validAward,
      [AWARD_LOGO.id]: MEDIA_ID,
      [AWARD_LOGO.alt]: "",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual([AWARD_LOGO.alt]);
  });

  it("checks each image independently", () => {
    const result = awardSchema.safeParse({
      ...validAward,
      [AWARD_LOGO.id]: MEDIA_ID,
      [AWARD_LOGO.alt]: "The awarding body's crest",
      [AWARD_CERTIFICATE.id]: MEDIA_ID,
      [AWARD_CERTIFICATE.alt]: "",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual([AWARD_CERTIFICATE.alt]);
  });

  it("rejects an image id that is not a uuid", () => {
    const result = awardSchema.safeParse({
      ...validAward,
      [AWARD_LOGO.id]: "https://cdn.example.com/logo.png",
      [AWARD_LOGO.alt]: "A logo",
    });
    expect(result.success).toBe(false);
  });

  // A `javascript:` URL in a CMS field is stored XSS the moment a template
  // renders it as an href.
  it("rejects a link with a scheme other than http or https", () => {
    for (const link of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "example.org/awards",
    ]) {
      expect(awardSchema.safeParse({ ...validAward, externalLink: link }).success).toBe(
        false,
      );
    }
  });

  it("rejects a year outside the allowed range", () => {
    expect(awardSchema.safeParse({ ...validAward, year: "1750" }).success).toBe(false);
    expect(awardSchema.safeParse({ ...validAward, year: "2999" }).success).toBe(false);
  });

  it("rejects a non-numeric year", () => {
    expect(awardSchema.safeParse({ ...validAward, year: "last year" }).success).toBe(
      false,
    );
  });

  it("rejects an empty awarding body", () => {
    expect(awardSchema.safeParse({ ...validAward, awardingBody: "" }).success).toBe(
      false,
    );
  });
});

describe("slugify", () => {
  it("lowercases and kebab-cases a title", () => {
    expect(slugify("Best Private Hospital 2025")).toBe("best-private-hospital-2025");
  });

  it("strips punctuation rather than encoding it", () => {
    expect(slugify("Do I need an appointment?")).toBe("do-i-need-an-appointment");
  });

  it("collapses runs of separators and trims the ends", () => {
    expect(slugify("  --Women & Children--  ")).toBe("women-children");
  });

  it("strips combining marks instead of losing the letter", () => {
    expect(slugify("Ẹkó clinic")).toBe("eko-clinic");
  });

  it("produces something the slug field accepts", () => {
    const slug = slugify("Best Private Hospital 2025");
    expect(faqSchema.safeParse({ ...validFaq, slug }).success).toBe(true);
  });

  it("never ends in a hyphen after truncation", () => {
    const slug = slugify(`${"a".repeat(79)} tail`);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug.length).toBeLessThanOrEqual(80);
  });
});
