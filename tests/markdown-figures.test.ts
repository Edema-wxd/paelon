import { describe, expect, it } from "vitest";

import {
  collectMediaIds,
  headingSkips,
  imagePlacementIssues,
  parseMarkdown,
  readingTimeMinutes,
  toPlainText,
  type Block,
} from "@/lib/markdown";

const ID = "0f3c1d2e-4a5b-6c7d-8e9f-a0b1c2d3e4f5";

/** The first block, narrowed. Keeps each assertion to the thing it is testing. */
function firstBlock(source: string): Block | undefined {
  return parseMarkdown(source)[0];
}

describe("parseMarkdown — figures", () => {
  it("reads a block-level media reference as a figure", () => {
    expect(firstBlock(`![A nurse weighing a baby](media:${ID})`)).toEqual({
      type: "figure",
      mediaId: ID,
      alt: "A nurse weighing a baby",
      caption: null,
    });
  });

  it("reads the Markdown title as a caption", () => {
    expect(firstBlock(`![Alt](media:${ID} "Paediatrics clinic")`)).toEqual({
      type: "figure",
      mediaId: ID,
      alt: "Alt",
      caption: "Paediatrics clinic",
    });
  });

  it("treats an empty title as no caption, not an empty one", () => {
    const block = firstBlock(`![Alt](media:${ID} "")`);
    expect(block).toMatchObject({ type: "figure", caption: null });
  });

  it("keeps an empty alt, which is a real answer for a decorative image", () => {
    expect(firstBlock(`![](media:${ID})`)).toMatchObject({
      type: "figure",
      alt: "",
    });
  });

  it("lower-cases the id, so a reference is matched however it was typed", () => {
    expect(firstBlock(`![Alt](media:${ID.toUpperCase()})`)).toMatchObject({
      mediaId: ID,
    });
  });

  it("refuses a malformed id rather than emitting a broken figure", () => {
    expect(firstBlock("![Alt](media:not-a-uuid)")).toMatchObject({
      type: "paragraph",
    });
  });

  it("refuses a bare URL — alt text and dimensions live on the media row", () => {
    expect(firstBlock("![Alt](https://cdn.example.test/x.png)")).toMatchObject({
      type: "paragraph",
    });
  });

  it("leaves an image inside a sentence as text, never as a link", () => {
    const blocks = parseMarkdown(`Before ![Alt](media:${ID}) after.`);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("paragraph");

    // The regression this guards: the link branch used to match the
    // `[Alt](media:…)` half and leave the `!` stranded.
    const inline = blocks[0]?.type === "paragraph" ? blocks[0].children : [];
    expect(inline.some((node) => node.type === "link")).toBe(false);
    expect(toPlainText(`Before ![Alt](media:${ID}) after.`)).toContain("![Alt]");
  });

  it("collects each referenced id once, in document order", () => {
    const other = "11112222-3333-4444-5555-666677778888";
    const source = `![A](media:${ID})\n\n![B](media:${other})\n\n![C](media:${ID})`;

    expect(collectMediaIds(parseMarkdown(source))).toEqual([ID, other]);
  });

  it("counts a caption as words and alt text as none", () => {
    // Alt text describes the picture for anyone who cannot see it; it is not
    // part of the article's prose.
    const withAlt = `![${"word ".repeat(400)}](media:${ID})`;
    expect(readingTimeMinutes(withAlt)).toBe(1);
    expect(toPlainText(`![Alt](media:${ID} "A caption")`)).toBe("A caption");
  });
});

describe("imagePlacementIssues", () => {
  it("says nothing about a correctly placed figure", () => {
    expect(imagePlacementIssues(`![Alt](media:${ID})`)).toEqual([]);
  });

  it("reports an image inside a sentence", () => {
    expect(imagePlacementIssues(`Text ![Alt](media:${ID}) more`)).toEqual([
      { source: `![Alt](media:${ID})`, reason: "inline" },
    ]);
  });

  it("reports a reference that is not a media reference", () => {
    expect(
      imagePlacementIssues("![Alt](https://cdn.example.test/x.png)"),
    ).toEqual([
      { source: "![Alt](https://cdn.example.test/x.png)", reason: "not-a-media-reference" },
    ]);
  });

  it("separates a malformed id from a misplaced image", () => {
    expect(imagePlacementIssues("![Alt](media:nope)")).toEqual([
      { source: "![Alt](media:nope)", reason: "malformed-id" },
    ]);
  });
});

describe("parseMarkdown — tables", () => {
  const source = [
    "| Symptom | When to call us |",
    "| --- | ---: |",
    "| Fever over 38°C | Same day |",
    "| Rash | Within two days |",
  ].join("\n");

  it("reads a header row, an alignment row and body rows", () => {
    const block = firstBlock(source);

    expect(block).toMatchObject({ type: "table", align: [null, "right"] });
    expect(block?.type === "table" ? block.head : []).toEqual([
      [{ type: "text", value: "Symptom" }],
      [{ type: "text", value: "When to call us" }],
    ]);
    expect(block?.type === "table" ? block.rows : []).toHaveLength(2);
  });

  it("reads the three alignment markers", () => {
    const block = firstBlock("| a | b | c |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |");
    expect(block?.type === "table" ? block.align : []).toEqual([
      "left",
      "center",
      "right",
    ]);
  });

  it("pads a short row to the header's width rather than dropping the table", () => {
    const block = firstBlock("| a | b |\n| --- | --- |\n| only |");
    expect(block?.type === "table" ? block.rows[0] : []).toEqual([
      [{ type: "text", value: "only" }],
      [],
    ]);
  });

  it("parses inline markup inside cells", () => {
    const block = firstBlock("| a |\n| --- |\n| **bold** |");
    expect(block?.type === "table" ? block.rows[0]?.[0] : []).toEqual([
      { type: "strong", children: [{ type: "text", value: "bold" }] },
    ]);
  });

  it("is a paragraph without a delimiter row — a table needs a header", () => {
    expect(firstBlock("| a | b |\n| c | d |")).toMatchObject({
      type: "paragraph",
    });
  });

  it("is a paragraph when the header and the delimiter disagree in width", () => {
    expect(firstBlock("| a | b |\n| --- |\n| c | d |")).toMatchObject({
      type: "paragraph",
    });
  });
});

describe("parseMarkdown — h4", () => {
  it("reads #### as a level-4 heading", () => {
    expect(firstBlock("#### Four")).toEqual({
      type: "heading",
      level: 4,
      children: [{ type: "text", value: "Four" }],
    });
  });

  it("does not read ##### as a heading — there is no h5 in a body", () => {
    expect(firstBlock("##### Five")).toMatchObject({ type: "paragraph" });
  });
});

describe("headingSkips", () => {
  it("accepts a body that opens at h2 and descends one level at a time", () => {
    expect(headingSkips("## Two\n\n### Three\n\n#### Four")).toEqual([]);
  });

  it("accepts climbing back up any number of levels", () => {
    expect(headingSkips("## Two\n\n### Three\n\n#### Four\n\n## Two again")).toEqual(
      [],
    );
  });

  it("reports a body that opens below h2 — the page h1 is the only parent", () => {
    expect(headingSkips("### Three")).toEqual([
      { level: 3, after: 1, text: "Three" },
    ]);
  });

  it("reports a jump from h2 to h4", () => {
    expect(headingSkips("## Two\n\n#### Four")).toEqual([
      { level: 4, after: 2, text: "Four" },
    ]);
  });

  it("ignores every block that is not a heading", () => {
    expect(headingSkips("## Two\n\nA paragraph.\n\n- an item\n\n### Three")).toEqual(
      [],
    );
  });
});
