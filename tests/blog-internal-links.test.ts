import { describe, expect, it } from "vitest";

import {
  MIN_INTERNAL_LINKS,
  internalLinks,
  normalisePath,
  uniquePaths,
} from "@/lib/blog/internal-links";

/**
 * The count half of Conversion baseline item 14 — "at least two contextual
 * links to real site routes" — which is what `/admin/blog` refuses a publish
 * on. The resolution half reads rows and is covered by the integration tests.
 *
 * Nothing here is a claim about Paelon. The bodies are filler: a fixture that
 * invented a plausible clinical sentence is one copy-paste from being seeded
 * (CLAUDE.md).
 */

describe("normalisePath", () => {
  it("keeps a plain route as it is", () => {
    expect(normalisePath("/services")).toBe("/services");
  });

  it("drops the fragment, the query and a trailing slash", () => {
    expect(normalisePath("/contact#form")).toBe("/contact");
    expect(normalisePath("/blog/?page=2")).toBe("/blog");
    expect(normalisePath("/services/one/")).toBe("/services/one");
  });

  it("leaves the homepage as a single slash", () => {
    expect(normalisePath("/")).toBe("/");
  });
});

describe("internalLinks", () => {
  it("finds links in paragraphs, lists and quotes", () => {
    const body = [
      "Placeholder with [one](/services).",
      "- [two](/locations)",
      "> Placeholder [three](/book).",
    ].join("\n\n");

    expect(internalLinks(body).map((link) => link.path)).toEqual([
      "/services",
      "/locations",
      "/book",
    ]);
  });

  it("finds a link nested inside emphasis", () => {
    const body = "Placeholder **bold [inner](/contact) text**.";
    expect(internalLinks(body).map((link) => link.path)).toEqual(["/contact"]);
  });

  it("ignores external links", () => {
    const body =
      "Placeholder [out](https://example.com) and [in](/blog) and [mail](mailto:a@b.co).";
    expect(internalLinks(body).map((link) => link.path)).toEqual(["/blog"]);
  });

  it("ignores an unsafe href, which the parser has already degraded to text", () => {
    // `lib/markdown.ts` renders these as plain words, so they are not links
    // the reader can click and must not count towards the minimum.
    const body = "Placeholder [x](javascript:alert(1)) and [y](data:text/html,x).";
    expect(internalLinks(body)).toEqual([]);
  });

  it("keeps the href whole and normalises the path beside it", () => {
    expect(internalLinks("Placeholder [a](/services/one#fees).")).toEqual([
      { href: "/services/one#fees", path: "/services/one" },
    ]);
  });

  it("counts two links to the same page as two links, not two destinations", () => {
    const body = "Placeholder [a](/book) and [b](/book).";
    const links = internalLinks(body);

    expect(links).toHaveLength(2);
    expect(uniquePaths(links)).toEqual(["/book"]);
  });

  it("returns nothing for a body with no links", () => {
    expect(internalLinks("Placeholder paragraph.\n\n## Placeholder heading")).toEqual([]);
  });
});

describe("the baseline minimum", () => {
  const twoLinks = "Placeholder [a](/services) and [b](/locations).";
  const oneLink = "Placeholder [a](/services) only.";

  it("is two", () => {
    expect(MIN_INTERNAL_LINKS).toBe(2);
  });

  it("accepts a body carrying two", () => {
    expect(internalLinks(twoLinks).length).toBeGreaterThanOrEqual(MIN_INTERNAL_LINKS);
  });

  it("rejects a body carrying one", () => {
    expect(internalLinks(oneLink).length).toBeLessThan(MIN_INTERNAL_LINKS);
  });

  it("rejects a body whose only other link points off site", () => {
    const body = "Placeholder [a](/services) and [b](https://example.com).";
    expect(internalLinks(body).length).toBeLessThan(MIN_INTERNAL_LINKS);
  });
});
