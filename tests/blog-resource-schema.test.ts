import { describe, expect, it } from "vitest";

import { resourceInput } from "@/lib/admin/resource-input";
import {
  authorResource,
  authorSchema,
  AUTHOR_DOCTOR_FIELD,
  AUTHOR_HEADSHOT,
} from "@/lib/admin/resources/authors";
import {
  BLOG_HERO,
  BLOG_RELATED_FIELD,
  blogPostResource,
  blogPostSchema,
} from "@/lib/admin/resources/blog-posts";
import { toDateInput, toTimestamp } from "@/lib/admin/resources/fields";

/**
 * Accept and reject cases for the blog and author form schemas (CLAUDE.md
 * testing floor: every form submission schema, both directions).
 *
 * The publish rules get most of the space, because they are the part that is
 * not boilerplate: Conversion baseline item 14 is enforced here for the count
 * and the publication date, and on the server for whether each link resolves
 * (`lib/admin/blog-publish.ts`, which needs a database and is covered by the
 * integration tests).
 *
 * Every rule is asserted in both directions *and* asserted not to fire on a
 * draft. A publish gate that also blocks saving a half-written draft is a gate
 * editors work around, which is worse than not having one.
 *
 * Nothing here is a claim about Paelon. The fixtures are deliberate filler: a
 * test that invents a plausible clinical sentence is one copy-paste away from
 * being seeded (CLAUDE.md).
 */

const UUID_A = "3f7c1f4e-5a8b-4c2d-9e10-0b6a2d3c4e5f";
const UUID_B = "8c2d9e10-0b6a-4d3c-9e10-5a8b4c2d3f7c";

/** Read a field whose name comes from a config constant. */
function field(parsed: unknown, name: string): unknown {
  return (parsed as Record<string, unknown>)[name];
}

/** A submission with one control absent — an unticked checkbox submits nothing. */
function without<T extends Record<string, unknown>>(input: T, key: keyof T) {
  const copy = { ...input };
  delete copy[key];
  return copy;
}

/** The first message filed against `path`, or undefined. */
function issueOn(result: { success: boolean; error?: unknown }, path: string) {
  if (result.success) return undefined;
  const error = result.error as { issues: Array<{ path: PropertyKey[]; message: string }> };
  return error.issues.find((issue) => issue.path[0] === path)?.message;
}

/* -------------------------------------------------------------------------- */
/* authors                                                                    */
/* -------------------------------------------------------------------------- */

const validAuthor = {
  name: "Placeholder Name",
  slug: "placeholder-name",
  role: "Placeholder role",
  bio: "Placeholder bio paragraph.",
  [AUTHOR_DOCTOR_FIELD]: "",
  order: "3",
  published: "on",
  // An empty id is "no image", which is how the control submits when nothing
  // is chosen — the same shape the awards fixtures use.
  [AUTHOR_HEADSHOT.id]: "",
  [AUTHOR_HEADSHOT.alt]: "",
};

describe("authorSchema", () => {
  it("accepts a filled form", () => {
    const parsed = authorSchema.parse(validAuthor);

    expect(parsed.name).toBe("Placeholder Name");
    expect(parsed.order).toBe(3);
    expect(parsed.published).toBe(true);
  });

  it("stores a blank doctor as null rather than an empty string", () => {
    expect(field(authorSchema.parse(validAuthor), AUTHOR_DOCTOR_FIELD)).toBeNull();
  });

  it("keeps a chosen doctor", () => {
    const parsed = authorSchema.parse({ ...validAuthor, [AUTHOR_DOCTOR_FIELD]: UUID_A });
    expect(field(parsed, AUTHOR_DOCTOR_FIELD)).toBe(UUID_A);
  });

  it("rejects a doctor id that is not a uuid", () => {
    const result = authorSchema.safeParse({
      ...validAuthor,
      [AUTHOR_DOCTOR_FIELD]: "not-a-uuid",
    });
    expect(issueOn(result, AUTHOR_DOCTOR_FIELD)).toMatch(/from the list/);
  });

  it("rejects a missing name, role and bio", () => {
    for (const key of ["name", "role", "bio"] as const) {
      const result = authorSchema.safeParse({ ...validAuthor, [key]: "  " });
      expect(issueOn(result, key)).toBeDefined();
    }
  });

  it("rejects a slug that is not kebab-case", () => {
    const result = authorSchema.safeParse({ ...validAuthor, slug: "Not A Slug" });
    expect(issueOn(result, "slug")).toMatch(/lowercase/);
  });

  it("treats an absent published checkbox as a draft", () => {
    expect(authorSchema.parse(without(validAuthor, "published")).published).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* blog posts                                                                 */
/* -------------------------------------------------------------------------- */

/** Two internal links, in the sentences they belong to. */
const bodyWithTwoLinks = [
  "Placeholder opening sentence pointing at [our services](/services).",
  "Placeholder second paragraph naming [a branch](/locations).",
].join("\n\n");

const validPost = {
  title: "Placeholder Title",
  slug: "placeholder-title",
  excerpt: "Placeholder excerpt.",
  body: bodyWithTwoLinks,
  authorId: UUID_A,
  category: "family_health",
  tags: ["one", "two"],
  publishedAt: "2026-09-01",
  [BLOG_RELATED_FIELD]: [UUID_B],
  order: "0",
  published: "on",
  [BLOG_HERO.id]: "",
  [BLOG_HERO.alt]: "",
};

/** The same submission as a draft: nothing published, no date. */
const asDraft = (overrides: Record<string, unknown> = {}) => ({
  ...without(validPost, "published"),
  publishedAt: "",
  ...overrides,
});

describe("blogPostSchema", () => {
  it("accepts a publishable post", () => {
    const parsed = blogPostSchema.parse(validPost);

    expect(parsed.title).toBe("Placeholder Title");
    expect(parsed.published).toBe(true);
    expect(parsed.publishedAt).toBe("2026-09-01");
    expect(field(parsed, BLOG_RELATED_FIELD)).toEqual([UUID_B]);
  });

  it("rejects a post with no author", () => {
    const result = blogPostSchema.safeParse({ ...validPost, authorId: "" });
    expect(issueOn(result, "authorId")).toMatch(/from the list/);
  });

  it("rejects a category outside the enum", () => {
    const result = blogPostSchema.safeParse({ ...validPost, category: "not_a_category" });
    expect(issueOn(result, "category")).toBeDefined();
  });

  describe("the internal-link minimum (baseline item 14)", () => {
    it("rejects publishing a body with one internal link", () => {
      const body = "Placeholder sentence pointing at [our services](/services).";
      const result = blogPostSchema.safeParse({ ...validPost, body });

      expect(issueOn(result, "body")).toMatch(/at least 2/);
    });

    it("rejects publishing a body with none", () => {
      const result = blogPostSchema.safeParse({
        ...validPost,
        body: "Placeholder body with no links at all.",
      });

      expect(issueOn(result, "body")).toMatch(/at least 2/);
    });

    it("does not count an external link towards the minimum", () => {
      const body = [
        "Placeholder pointing at [our services](/services).",
        "Placeholder pointing [off site](https://example.com).",
      ].join("\n\n");
      const result = blogPostSchema.safeParse({ ...validPost, body });

      expect(issueOn(result, "body")).toMatch(/at least 2/);
    });

    it("counts a link nested in emphasis", () => {
      const body = [
        "Placeholder **with [one](/services) inside bold**.",
        "Placeholder with [two](/contact).",
      ].join("\n\n");

      expect(blogPostSchema.safeParse({ ...validPost, body }).success).toBe(true);
    });

    it("lets a draft be saved with no links at all", () => {
      const result = blogPostSchema.safeParse(asDraft({ body: "Placeholder, still writing." }));
      expect(result.success).toBe(true);
    });
  });

  describe("the publication date", () => {
    it("refuses to publish without one", () => {
      const result = blogPostSchema.safeParse({ ...validPost, publishedAt: "" });
      expect(issueOn(result, "publishedAt")).toMatch(/stays off \/blog/);
    });

    it("lets a draft have none, stored as null", () => {
      const parsed = blogPostSchema.parse(asDraft());
      expect(parsed.publishedAt).toBeNull();
    });

    it("refuses a future date, which would sit at the top of /blog today", () => {
      const nextYear = `${new Date().getUTCFullYear() + 1}-01-01`;
      const result = blogPostSchema.safeParse({ ...validPost, publishedAt: nextYear });

      expect(issueOn(result, "publishedAt")).toMatch(/cannot be in the future/);
    });

    it("refuses something that is not a date", () => {
      const result = blogPostSchema.safeParse({ ...validPost, publishedAt: "last Tuesday" });
      expect(issueOn(result, "publishedAt")).toBeDefined();
    });
  });

  it("dedupes related posts and drops blanks", () => {
    const parsed = blogPostSchema.parse({
      ...validPost,
      [BLOG_RELATED_FIELD]: [UUID_B, UUID_B, ""],
    });

    expect(field(parsed, BLOG_RELATED_FIELD)).toEqual([UUID_B]);
  });

  it("rejects a related id that is not a uuid", () => {
    const result = blogPostSchema.safeParse({
      ...validPost,
      [BLOG_RELATED_FIELD]: ["not-a-uuid"],
    });
    expect(issueOn(result, BLOG_RELATED_FIELD)).toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* the FormData reader                                                        */
/* -------------------------------------------------------------------------- */

describe("resourceInput for a post", () => {
  it("reads tags and related posts as arrays, even with one of each", () => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(validPost)) {
      if (Array.isArray(value)) continue;
      formData.set(key, String(value));
    }
    formData.append("tags", "only-one");
    formData.append(BLOG_RELATED_FIELD, UUID_B);

    const input = resourceInput(blogPostResource, formData);

    expect(input.tags).toEqual(["only-one"]);
    expect(input[BLOG_RELATED_FIELD]).toEqual([UUID_B]);
  });

  it("gives an empty array when nothing was picked", () => {
    const formData = new FormData();
    formData.set("title", "Placeholder");

    const input = resourceInput(blogPostResource, formData);

    expect(input.tags).toEqual([]);
    expect(input[BLOG_RELATED_FIELD]).toEqual([]);
  });

  it("reads an author form with no list fields", () => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(validAuthor)) {
      formData.set(key, String(value));
    }

    expect(resourceInput(authorResource, formData).name).toBe("Placeholder Name");
  });
});

/* -------------------------------------------------------------------------- */
/* date conversion                                                            */
/* -------------------------------------------------------------------------- */

describe("the date control's two conversions", () => {
  it("writes midnight UTC, not the server's midnight", () => {
    expect(toTimestamp("2026-09-01")?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("passes null through", () => {
    expect(toTimestamp(null)).toBeNull();
  });

  it("reads a timestamp column back as YYYY-MM-DD", () => {
    expect(toDateInput(new Date("2026-09-01T00:00:00Z"))).toBe("2026-09-01");
  });

  it("reads a date column, which arrives as a string, unchanged", () => {
    expect(toDateInput("2026-09-01")).toBe("2026-09-01");
  });

  it("gives the empty string for null, undefined and nonsense", () => {
    expect(toDateInput(null)).toBe("");
    expect(toDateInput(undefined)).toBe("");
    expect(toDateInput("last Tuesday")).toBe("");
  });

  it("round-trips a stored value back into the control", () => {
    const stored = toTimestamp("2026-09-01");
    expect(toDateInput(stored)).toBe("2026-09-01");
  });
});

describe("blogPostSchema — images", () => {
  const ID = "0f3c1d2e-4a5b-6c7d-8e9f-a0b1c2d3e4f5";

  function errorsOn(input: Record<string, unknown>, path: string): string[] {
    const result = blogPostSchema.safeParse(input);
    if (result.success) return [];
    return result.error.issues
      .filter((issue) => issue.path[0] === path)
      .map((issue) => issue.message);
  }

  it("accepts a body whose figure sits on a line of its own", () => {
    const body = `${bodyWithTwoLinks}\n\n![A ward corridor](media:${ID})`;
    expect(blogPostSchema.safeParse({ ...validPost, body }).success).toBe(true);
  });

  it("refuses to publish a figure written inside a sentence", () => {
    const body = `${bodyWithTwoLinks}\n\nSee ![A ward](media:${ID}) here.`;
    expect(errorsOn({ ...validPost, body }, "body").join(" ")).toContain(
      "line of its own",
    );
  });

  it("refuses to publish an image given as a URL rather than a library id", () => {
    const body = `${bodyWithTwoLinks}\n\n![A ward](https://cdn.example.test/x.png)`;
    expect(errorsOn({ ...validPost, body }, "body").join(" ")).toContain(
      "media library",
    );
  });

  it("lets a draft hold a misplaced image — it is mid-edit, not broken", () => {
    const body = `Text ![A ward](media:${ID}) more`;
    const draft = without({ ...validPost, body }, "published");
    expect(blogPostSchema.safeParse(draft).success).toBe(true);
  });

  it("refuses to publish a heading that skips a level", () => {
    const body = `${bodyWithTwoLinks}\n\n## Two\n\n#### Four`;
    expect(errorsOn({ ...validPost, body }, "body").join(" ")).toContain(
      "cannot skip a step",
    );
  });

  it("accepts headings that descend one level at a time", () => {
    const body = `${bodyWithTwoLinks}\n\n## Two\n\n### Three\n\n#### Four`;
    expect(blogPostSchema.safeParse({ ...validPost, body }).success).toBe(true);
  });

  it("lets a draft skip a heading level", () => {
    const body = `${bodyWithTwoLinks}\n\n#### Four`;
    const draft = without({ ...validPost, body }, "published");
    expect(blogPostSchema.safeParse(draft).success).toBe(true);
  });

  it("requires alt text once a hero image is chosen", () => {
    const input = { ...validPost, [BLOG_HERO.id]: ID, [BLOG_HERO.alt]: "" };
    expect(errorsOn(input, BLOG_HERO.alt).length).toBeGreaterThan(0);
  });

  it("accepts a hero image marked decorative with no alt text", () => {
    const input = {
      ...validPost,
      [BLOG_HERO.id]: ID,
      [BLOG_HERO.alt]: "",
      [BLOG_HERO.decorative]: "on",
    };
    expect(blogPostSchema.safeParse(input).success).toBe(true);
  });

  it("rejects a hero image id that is not a uuid", () => {
    const input = {
      ...validPost,
      [BLOG_HERO.id]: "https://cdn.example.test/x.png",
      [BLOG_HERO.alt]: "A ward",
    };
    expect(blogPostSchema.safeParse(input).success).toBe(false);
  });
});
