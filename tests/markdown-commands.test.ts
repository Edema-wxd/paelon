import { describe, expect, it } from "vitest";

import {
  applyEdit,
  countWords,
  insertLink,
  toggleBlock,
  toggleInline,
  type Edit,
} from "@/lib/admin/markdown-commands";
import { parseMarkdown } from "@/lib/markdown";

/** Apply and return the result plus the text left selected. */
function run(value: string, edit: Edit) {
  const next = applyEdit(value, edit);
  return { next, selected: next.slice(edit.select.start, edit.select.end) };
}

/** `[` and `]` in the fixture mark the selection. */
function sel(marked: string) {
  const start = marked.indexOf("[");
  const end = marked.indexOf("]") - 1;
  return { value: marked.replace("[", "").replace("]", ""), selection: { start, end } };
}

const blockTypes = (source: string) => parseMarkdown(source).map((block) => block.type);

describe("toggleInline", () => {
  it("italic writes *x*, which the parser renders as emphasis", () => {
    const { value, selection } = sel("Some [word] here.");
    const { next } = run(value, toggleInline(value, selection, "italic"));
    expect(next).toBe("Some *word* here.");
    const para = parseMarkdown(next)[0];
    expect(para?.type === "paragraph" && para.children.some((c) => c.type === "em")).toBe(true);
  });

  it("bold wraps and selects the inner text", () => {
    const { value, selection } = sel("a [b] c");
    const { next, selected } = run(value, toggleInline(value, selection, "bold"));
    expect(next).toBe("a **b** c");
    expect(selected).toBe("b");
  });

  it("pressing bold again unwraps instead of nesting", () => {
    const { value, selection } = sel("a **[b]** c");
    expect(run(value, toggleInline(value, selection, "bold")).next).toBe("a b c");
  });

  it("unwraps when the markers are inside the selection", () => {
    const { value, selection } = sel("a [**b**] c");
    expect(run(value, toggleInline(value, selection, "bold")).next).toBe("a b c");
  });

  it("refuses italic inside bold, which the parser cannot nest", () => {
    const { value, selection } = sel("**[b]**");
    expect(run(value, toggleInline(value, selection, "italic")).next).toBe("**b**");
  });

  it("inserts a selected placeholder when nothing is selected", () => {
    const { next, selected } = run("x ", toggleInline("x ", { start: 2, end: 2 }, "bold"));
    expect(next).toBe("x **bold text**");
    expect(selected).toBe("bold text");
  });
});

describe("insertLink", () => {
  it("wraps selected text and selects the address to type next", () => {
    const { value, selection } = sel("See [our services] today.");
    const { next, selected } = run(value, insertLink(value, selection));
    expect(next).toBe("See [our services](/path) today.");
    expect(selected).toBe("/path");
  });

  it("selects the link text placeholder when nothing is selected", () => {
    expect(run("", insertLink("", { start: 0, end: 0 })).selected).toBe("link text");
  });
});

describe("toggleBlock", () => {
  it("a heading mid-paragraph becomes its own block, not literal ##", () => {
    const value = "First line.\nSecond line.";
    const at = value.indexOf("Second");
    const { next } = run(value, toggleBlock(value, { start: at, end: at }, "heading2"));
    expect(next).toBe("First line.\n\n## Second line.");
    expect(blockTypes(next)).toEqual(["paragraph", "heading"]);
  });

  it("separates a heading from text on both sides", () => {
    const value = "Before.\nTitle\nAfter.";
    const at = value.indexOf("Title");
    const { next } = run(value, toggleBlock(value, { start: at, end: at + 5 }, "heading3"));
    expect(next).toBe("Before.\n\n### Title\n\nAfter.");
    expect(blockTypes(next)).toEqual(["paragraph", "heading", "paragraph"]);
  });

  it("makes every selected line a list item", () => {
    const value = "Intro:\nfirst\nsecond\nthird";
    const from = value.indexOf("first");
    const { next } = run(value, toggleBlock(value, { start: from, end: value.length }, "bullets"));
    expect(next).toBe("Intro:\n\n- first\n- second\n- third");
    expect(blockTypes(next)).toEqual(["paragraph", "list"]);
  });

  it("numbers a list", () => {
    const value = "a\nb";
    const { next } = run(value, toggleBlock(value, { start: 0, end: 3 }, "numbers"));
    expect(next).toBe("1. a\n2. b");
  });

  it("switches one kind of block to another instead of stacking prefixes", () => {
    const value = "- a\n- b";
    const { next } = run(value, toggleBlock(value, { start: 0, end: value.length }, "quote"));
    expect(next).toBe("> a\n> b");
  });

  it("pressing the same block button again turns it back into text", () => {
    const value = "## Title";
    expect(run(value, toggleBlock(value, { start: 3, end: 3 }, "heading2")).next).toBe("Title");
  });

  it("does not add blank lines that are already there", () => {
    const value = "Para.\n\nitem\n\nPara.";
    const at = value.indexOf("item");
    const { next } = run(value, toggleBlock(value, { start: at, end: at }, "bullets"));
    expect(next).toBe("Para.\n\n- item\n\nPara.");
  });

  it("selects a placeholder on an empty line", () => {
    const { next, selected } = run("", toggleBlock("", { start: 0, end: 0 }, "quote"));
    expect(next).toBe("> Quoted text");
    expect(selected).toBe("Quoted text");
  });
});

describe("countWords", () => {
  it("counts words, not syntax", () => {
    expect(countWords("## A heading\n\n- **bold** item\n\n[link text](/services)")).toBe(6);
    expect(countWords("")).toBe(0);
  });
});
