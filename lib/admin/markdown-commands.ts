/**
 * The Markdown editor's toolbar commands, as pure functions over the text and
 * the selection — so they can be tested without a DOM, and so every command
 * writes syntax `lib/markdown.ts` actually parses.
 *
 * That last point is why this module exists. The toolbar used to insert `_x_`
 * for italic (the parser reads `*x*` only) and drop `## ` or `- ` at the caret
 * with no blank lines around it — and the parser only recognises a heading,
 * list or quote that is a block of its own. Both rendered as literal text on
 * the live page.
 *
 * Each command returns an *edit*: the range of the original text to replace,
 * the text to put there, and where the selection should land afterwards. The
 * component applies it with the browser's own insert so Ctrl/⌘-Z still works.
 */

export interface Selection {
  start: number;
  end: number;
}

export interface Edit {
  /** Range of the original value to replace. */
  from: number;
  to: number;
  insert: string;
  /** Selection after the edit, in the new value's offsets. */
  select: Selection;
}

export type InlineCommand = "bold" | "italic";
export type BlockCommand = "heading2" | "heading3" | "bullets" | "numbers" | "quote";

const INLINE_MARKER: Record<InlineCommand, string> = { bold: "**", italic: "*" };
const INLINE_PLACEHOLDER: Record<InlineCommand, string> = {
  bold: "bold text",
  italic: "italic text",
};

/**
 * Wrap the selection in `**` or `*`, or unwrap it if it is already wrapped.
 *
 * "Already wrapped" means the markers sit just outside the selection or are
 * its first and last characters. Italic checks it is not looking at half of a
 * bold marker, or toggling italic inside `**x**` would strip one asterisk from
 * each side and leave `*x*`.
 *
 * Italic inside bold is refused — the edit leaves the text as it is. The parser
 * cannot nest them (`***x***` renders as stray asterisks around bold text), so
 * the honest result of the click is no change rather than broken output.
 */
export function toggleInline(
  value: string,
  { start, end }: Selection,
  command: InlineCommand,
): Edit {
  const marker = INLINE_MARKER[command];
  const m = marker.length;
  const selected = value.slice(start, end);

  if (
    command === "italic" &&
    selected.length > 0 &&
    ((value.slice(start - 2, start) === "**" && value.slice(end, end + 2) === "**") ||
      (selected.startsWith("**") && selected.endsWith("**")))
  ) {
    return { from: start, to: end, insert: selected, select: { start, end } };
  }

  const isMarkerAt = (at: number) =>
    value.slice(at, at + m) === marker &&
    (command !== "italic" || (value[at - 1] !== "*" && value[at + m] !== "*"));

  // Markers just outside the selection: **|text|**
  if (selected.length > 0 && start >= m && isMarkerAt(start - m) && isMarkerAt(end)) {
    return {
      from: start - m,
      to: end + m,
      insert: selected,
      select: { start: start - m, end: end - m },
    };
  }

  // Markers inside it: |**text**|
  if (
    selected.length > 2 * m &&
    selected.startsWith(marker) &&
    selected.endsWith(marker) &&
    (command !== "italic" || !selected.startsWith("**"))
  ) {
    const inner = selected.slice(m, -m);
    return { from: start, to: end, insert: inner, select: { start, end: start + inner.length } };
  }

  const body = selected || INLINE_PLACEHOLDER[command];
  return {
    from: start,
    to: end,
    insert: `${marker}${body}${marker}`,
    select: { start: start + m, end: start + m + body.length },
  };
}

/**
 * Turn the selection into a link.
 *
 * With text selected, that text becomes the link and the address is selected
 * next, because the address is what is left to type. With nothing selected,
 * the link text placeholder is selected first.
 */
export function insertLink(value: string, { start, end }: Selection): Edit {
  const selected = value.slice(start, end);
  const href = "/path";

  if (selected.length > 0) {
    const insert = `[${selected}](${href})`;
    const hrefAt = start + selected.length + 3;
    return { from: start, to: end, insert, select: { start: hrefAt, end: hrefAt + href.length } };
  }

  const text = "link text";
  return {
    from: start,
    to: end,
    insert: `[${text}](${href})`,
    select: { start: start + 1, end: start + 1 + text.length },
  };
}

/** Any block prefix the parser recognises, so switching kind replaces it. */
const ANY_BLOCK_PREFIX = /^(#{2,4}\s+|-\s+|\d+\.\s+|>\s?)/;

const BLOCK_TEST: Record<BlockCommand, RegExp> = {
  heading2: /^##\s+/,
  heading3: /^###\s+/,
  bullets: /^-\s+/,
  numbers: /^\d+\.\s+/,
  quote: /^>\s?/,
};

const BLOCK_PLACEHOLDER: Record<BlockCommand, string> = {
  heading2: "Heading",
  heading3: "Subheading",
  bullets: "List item",
  numbers: "List item",
  quote: "Quoted text",
};

/**
 * Make the selected lines a heading, list or quote — or plain text again if
 * they already are one.
 *
 * Works on whole lines, whatever part of them is selected, and on every line
 * selected: a list made from three selected lines gets three items, not one
 * item followed by two stray lines that turn the block back into a paragraph.
 *
 * Adds a blank line before and after when the neighbours are text. The parser
 * splits blocks on blank lines and only reads a chunk as a heading, list or
 * quote if all of it is one, so without the separators the result would merge
 * into the paragraph around it.
 *
 * A heading is a single line, so several selected lines are joined into it.
 */
export function toggleBlock(
  value: string,
  { start, end }: Selection,
  command: BlockCommand,
): Edit {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end > start && value[end - 1] === "\n" ? end - 1 : end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;

  const lines = value.slice(lineStart, lineEnd).split("\n");
  const nonEmpty = lines.filter((line) => line.trim().length > 0);

  // Already this kind: strip it and leave the lines where they are.
  if (nonEmpty.length > 0 && nonEmpty.every((line) => BLOCK_TEST[command].test(line))) {
    const insert = lines.map((line) => line.replace(ANY_BLOCK_PREFIX, "")).join("\n");
    return {
      from: lineStart,
      to: lineEnd,
      insert,
      select: { start: lineStart, end: lineStart + insert.length },
    };
  }

  const texts = nonEmpty.map((line) => line.replace(ANY_BLOCK_PREFIX, "").trim());
  const usedPlaceholder = texts.length === 0;
  const items = usedPlaceholder ? [BLOCK_PLACEHOLDER[command]] : texts;

  let block: string;
  switch (command) {
    case "heading2":
      block = `## ${items.join(" ")}`;
      break;
    case "heading3":
      block = `### ${items.join(" ")}`;
      break;
    case "bullets":
      block = items.map((item) => `- ${item}`).join("\n");
      break;
    case "numbers":
      block = items.map((item, index) => `${index + 1}. ${item}`).join("\n");
      break;
    case "quote":
      block = items.map((item) => `> ${item}`).join("\n");
      break;
  }

  const before = value.slice(0, lineStart);
  const after = value.slice(lineEnd);
  // `before` ends in "\n" unless the block starts the document; one more makes
  // the blank line. Same for `after`, which starts with "\n" unless it is empty.
  const lead = before.length === 0 || before.endsWith("\n\n") ? "" : "\n";
  const trail = after.length === 0 || after.startsWith("\n\n") ? "" : "\n";

  const insert = `${lead}${block}${trail}`;
  const blockAt = lineStart + lead.length;

  // A placeholder is selected so typing replaces it; real text gets the caret
  // at the end of the block, ready to carry on writing.
  const select = usedPlaceholder
    ? {
        start: blockAt + block.length - items[0]!.length,
        end: blockAt + block.length,
      }
    : { start: blockAt + block.length, end: blockAt + block.length };

  return { from: lineStart, to: lineEnd, insert, select };
}

/** Apply an edit to a string. The component uses the browser instead, for undo. */
export function applyEdit(value: string, edit: Edit): string {
  return value.slice(0, edit.from) + edit.insert + value.slice(edit.to);
}

/** Words in a Markdown body, ignoring syntax characters. For the editor footer. */
export function countWords(value: string): number {
  const text = value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\]\([^)]*\)/g, " ")
    .replace(/[#*>\-|[\]]/g, " ");
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return words ? words.length : 0;
}
