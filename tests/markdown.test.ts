import { describe, expect, it } from "vitest";

import {
  parseInline,
  parseMarkdown,
  readingTimeMinutes,
  toPlainText,
} from "@/lib/markdown";

describe("parseMarkdown — blocks", () => {
  it("reads ## and ### as headings at the right level", () => {
    expect(parseMarkdown("## Two")).toEqual([
      { type: "heading", level: 2, children: [{ type: "text", value: "Two" }] },
    ]);
    expect(parseMarkdown("### Three")).toEqual([
      { type: "heading", level: 3, children: [{ type: "text", value: "Three" }] },
    ]);
  });

  it("does not promote a body h1 — the page title owns the only h1", () => {
    const [block] = parseMarkdown("# One");
    expect(block?.type).toBe("paragraph");
  });

  it("joins soft-wrapped lines into a single paragraph", () => {
    expect(parseMarkdown("one\ntwo")).toEqual([
      { type: "paragraph", children: [{ type: "text", value: "one two" }] },
    ]);
  });

  it("splits paragraphs on a blank line", () => {
    expect(parseMarkdown("one\n\ntwo")).toHaveLength(2);
  });

  it("reads unordered and ordered lists", () => {
    const [unordered] = parseMarkdown("- a\n- b");
    expect(unordered).toMatchObject({ type: "list", ordered: false });
    expect(unordered).toHaveProperty("items.length", 2);

    const [ordered] = parseMarkdown("1. a\n2. b");
    expect(ordered).toMatchObject({ type: "list", ordered: true });
  });

  it("reads a multi-line blockquote as one quote", () => {
    expect(parseMarkdown("> one\n> two")).toEqual([
      { type: "quote", children: [{ type: "text", value: "one two" }] },
    ]);
  });

  it("ignores leading, trailing and repeated blank lines", () => {
    expect(parseMarkdown("\n\n  one  \n\n\n\ntwo\n\n")).toHaveLength(2);
  });

  it("returns nothing for an empty body", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   \n\n  ")).toEqual([]);
  });
});

describe("parseInline", () => {
  it("reads strong before emphasis", () => {
    expect(parseInline("**bold**")).toEqual([
      { type: "strong", children: [{ type: "text", value: "bold" }] },
    ]);
    expect(parseInline("*soft*")).toEqual([
      { type: "em", children: [{ type: "text", value: "soft" }] },
    ]);
  });

  it("keeps the text either side of a marked span", () => {
    expect(parseInline("a **b** c")).toEqual([
      { type: "text", value: "a " },
      { type: "strong", children: [{ type: "text", value: "b" }] },
      { type: "text", value: " c" },
    ]);
  });

  it("marks a root-relative href as internal and an absolute one as external", () => {
    expect(parseInline("[x](/contact)")).toEqual([
      {
        type: "link",
        href: "/contact",
        external: false,
        children: [{ type: "text", value: "x" }],
      },
    ]);
    expect(parseInline("[x](https://example.com)")).toMatchObject([
      { type: "link", external: true },
    ]);
  });

  it("never produces a link node for an unsafe href", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:void(0)",
      "data:text/html,<script>",
      "//evil.example.com",
      "vbscript:msgbox",
    ]) {
      const nodes = parseInline(`[click](${href})`);
      expect(nodes.some((node) => node.type === "link")).toBe(false);
      // The author's words survive even though the link does not.
      expect(nodes.map((n) => (n.type === "text" ? n.value : "")).join("")).toContain(
        "click",
      );
    }
  });

  it("allows the schemes a hospital body legitimately needs", () => {
    for (const href of ["https://example.com", "mailto:a@b.test", "tel:+2341234", "/contact"]) {
      expect(parseInline(`[x](${href})`)).toMatchObject([{ type: "link", href }]);
    }
  });

  it("leaves raw HTML as literal text rather than markup", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([
      { type: "text", value: "<script>alert(1)</script>" },
    ]);
  });

  it("leaves an unclosed marker alone instead of eating the rest of the line", () => {
    expect(parseInline("a ** b")).toEqual([{ type: "text", value: "a ** b" }]);
  });
});

describe("toPlainText and readingTimeMinutes", () => {
  const source = "## Title\n\nSome **bold** words and a [link](/x).\n\n- item";

  it("strips markers and flattens every block", () => {
    expect(toPlainText(source)).toBe("Title Some bold words and a link. item");
  });

  it("never returns a reading time below one minute", () => {
    expect(readingTimeMinutes("")).toBe(1);
    expect(readingTimeMinutes("one word")).toBe(1);
  });

  it("scales with length", () => {
    expect(readingTimeMinutes("word ".repeat(660))).toBe(3);
  });
});
