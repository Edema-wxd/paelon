/**
 * Minimal Markdown parser for blog post bodies.
 *
 * `blog_posts.body` is specified as MDX (spec §5, §6), but MDX needs a compiler
 * and no MDX package is on the approved dependency list in spec §2. Phase 1
 * ships no authoring UI, so the only thing a body has to do is render — and the
 * subset below covers everything long-form health writing uses. The stored
 * source stays valid MDX, so swapping in a real compiler in Phase 2 is a change
 * to the renderer alone, not to the content.
 *
 * Deliberately narrow. It parses to a typed AST rather than to an HTML string,
 * so `components/site/article-body.tsx` can build React elements directly and
 * nothing is ever passed through `dangerouslySetInnerHTML`. Raw HTML in a body
 * is treated as literal text, not markup.
 *
 * Supported: `##`/`###`/`####` headings, paragraphs, `-` and `1.` lists, `>`
 * quotes, pipe tables, `![alt](media:<id> "caption")` figures, `**strong**`,
 * `*emphasis*`, `[text](href)`.
 *
 * ## What is deliberately absent
 *
 * Code blocks, inline code, strikethrough and horizontal rules. A hospital's
 * health writing has no use for them, and every form this parser accepts is
 * surface area it has to keep safe — raw HTML included, which stays literal
 * text. Adding one is a decision, not an oversight.
 *
 * ## Images
 *
 * A figure references a `media` row by id, never a URL: alt text and the
 * intrinsic dimensions `next/image` needs both live on that row, and a bare URL
 * has nowhere to put them. Resolution needs the database, so it does not happen
 * here — this module stays free of any import that would drag the Neon driver
 * into the browser bundle, which is what `lib/blog/internal-links.ts` depends
 * on. The parser emits the id; `collectMediaIds` lists them for the page to
 * resolve, and `components/site/article-body.tsx` renders what it is handed.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; external: boolean; children: Inline[] };

/** Column alignment from a table's delimiter row. Null means the default. */
export type ColumnAlign = "left" | "center" | "right" | null;

export type Block =
  | { type: "heading"; level: 2 | 3 | 4; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; children: Inline[] }
  /**
   * A block-level image. `mediaId` is a `media.id`; `caption` is the optional
   * Markdown title, which renders as a `<figcaption>`.
   *
   * Block-level only. An image written inside a sentence stays literal text, so
   * an editor sees their mistake in the preview instead of losing the figure
   * silently — `imagePlacementIssues` is what reports it before publishing.
   */
  | { type: "figure"; mediaId: string; alt: string; caption: string | null }
  | {
      type: "table";
      /** Header cells. Always present — a table without one is not parsed. */
      head: Inline[][];
      rows: Inline[][][];
      align: ColumnAlign[];
    };

/**
 * Schemes a link in a body is allowed to use.
 *
 * A body is editor-supplied content, and in Phase 2 it becomes CMS-supplied.
 * `javascript:` and `data:` hrefs are the reason this list exists; anything not
 * matching is rendered as plain text so a bad link is inert rather than live.
 */
const SAFE_LINK = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/))/i;

const ORDERED_ITEM = /^\d+\.\s+/;
const UNORDERED_ITEM = /^-\s+/;

/**
 * A whole-chunk figure: `![alt](media:<uuid> "optional caption")`.
 *
 * Anchored at both ends, so this only ever matches an image that is a block of
 * its own. The id is matched as a uuid rather than as anything-up-to-a-paren:
 * a figure pointing at a malformed id would render as a broken image on a
 * hospital page, and the alt text is a better failure.
 *
 * `media:` and not a URL — see the module comment.
 */
const FIGURE =
  /^!\[([^\]]*)\]\(media:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\s+"([^"]*)")?\)$/;

/** Any image reference, wherever it sits. Used only to report misplaced ones. */
const ANY_IMAGE = /!\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g;

/**
 * A table's delimiter row: `| --- | :--: |`. Decides head from body.
 *
 * One dash is enough, as GFM specifies — `| :- | -: |` is a valid alignment
 * row, and requiring three would silently turn a correct table into a
 * paragraph.
 */
const TABLE_DELIMITER = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

/** Split a body into blocks. Blank lines separate them; single newlines do not. */
export function parseMarkdown(source: string): Block[] {
  const chunks = source
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  return chunks.map(parseBlock);
}

function parseBlock(chunk: string): Block {
  const lines = chunk.split("\n").map((line) => line.trim());

  const figure = FIGURE.exec(chunk);
  if (figure?.[2]) {
    return {
      type: "figure",
      mediaId: figure[2].toLowerCase(),
      alt: figure[1] ?? "",
      // An empty title is not a caption. `![alt](media:x "")` means the author
      // deleted the caption, so the `<figcaption>` should not render at all.
      caption: figure[3] !== undefined && figure[3].length > 0 ? figure[3] : null,
    };
  }

  const heading = /^(#{2,4})\s+(.*)$/.exec(chunk);
  if (heading?.[1] && heading[2] !== undefined) {
    const level = heading[1].length;
    return {
      type: "heading",
      level: level === 2 ? 2 : level === 3 ? 3 : 4,
      children: parseInline(heading[2]),
    };
  }

  const table = parseTable(lines);
  if (table) return table;

  if (lines.every((line) => line.startsWith(">"))) {
    const text = lines.map((line) => line.replace(/^>\s?/, "")).join(" ");
    return { type: "quote", children: parseInline(text) };
  }

  if (lines.every((line) => UNORDERED_ITEM.test(line))) {
    return {
      type: "list",
      ordered: false,
      items: lines.map((line) => parseInline(line.replace(UNORDERED_ITEM, ""))),
    };
  }

  if (lines.every((line) => ORDERED_ITEM.test(line))) {
    return {
      type: "list",
      ordered: true,
      items: lines.map((line) => parseInline(line.replace(ORDERED_ITEM, ""))),
    };
  }

  // Single newlines inside a paragraph are soft wraps in the source file, not
  // line breaks the reader should see.
  return { type: "paragraph", children: parseInline(lines.join(" ")) };
}

/**
 * A GFM pipe table, or null when the chunk is not one.
 *
 * Requires a header row and a delimiter row, in that order. A table whose
 * header is optional is a table a reader cannot navigate: `<th scope="col">` is
 * what a screen reader announces before each cell, and without it the grid is
 * unlabelled (spec §12). So a pipe block with no delimiter row falls through
 * and renders as the paragraph it looks like.
 *
 * Ragged rows are padded or trimmed to the header's width rather than refused.
 * A missing trailing cell is the commonest authoring slip, and dropping the
 * whole table over it would lose content the author wrote.
 */
function parseTable(lines: string[]): Block | null {
  if (lines.length < 2) return null;

  const [headLine, delimiterLine] = lines;
  if (headLine === undefined || delimiterLine === undefined) return null;
  if (!headLine.includes("|")) return null;
  if (!TABLE_DELIMITER.test(delimiterLine)) return null;

  const headCells = splitRow(headLine);
  const align = splitRow(delimiterLine).map(columnAlign);

  // The delimiter row defines the columns; a header that disagrees with it is
  // malformed rather than ragged, and guessing which one is right would put
  // cells under the wrong headings.
  if (align.length !== headCells.length) return null;

  const width = headCells.length;

  const rows = lines.slice(2).map((line) => {
    const cells = splitRow(line);
    return Array.from({ length: width }, (_, index) =>
      parseInline(cells[index] ?? ""),
    );
  });

  return {
    type: "table",
    head: headCells.map(parseInline),
    rows,
    align: Array.from({ length: width }, (_, index) => align[index] ?? null),
  };
}

/**
 * Split one table row into its cells.
 *
 * The leading and trailing pipes are optional in GFM, so they are stripped
 * before splitting rather than producing empty cells at each end.
 */
function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function columnAlign(cell: string): ColumnAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (left) return "left";
  if (right) return "right";
  return null;
}

/**
 * Every `media` id a body's figures reference, in document order and deduped.
 *
 * The page resolves these in one query and hands the result to `ArticleBody`.
 * Kept here rather than in the renderer so a server component can do the
 * database work before anything renders, which is what keeps the renderer a
 * pure function of its props.
 */
export function collectMediaIds(blocks: Block[]): string[] {
  const seen = new Set<string>();
  for (const block of blocks) {
    if (block.type === "figure") seen.add(block.mediaId);
  }
  return [...seen];
}

/** A heading that jumps more than one level below the one before it. */
export interface HeadingSkip {
  /** The level written, 2–4. */
  level: 2 | 3 | 4;
  /** The level it sits under. A body opens under the page's `h1`. */
  after: number;
  /** The heading's own text, for quoting back at the editor. */
  text: string;
}

/**
 * Headings that skip a level, in document order.
 *
 * A body's headings sit under the page's single `h1`, so the first one may be
 * an `h2` and nothing deeper. After that each heading may go one level deeper
 * than the last, any number of levels shallower, or stay put.
 *
 * Sequential headings with no skips are a WCAG 2.1 AA requirement on every
 * template (CLAUDE.md), and this is the one accessibility rule a renderer
 * cannot quietly fix: demoting an `h4` to an `h3` might be right, or the author
 * might have meant to write an `h3` above it. So it is reported to whoever
 * knows, at the point they can still answer.
 */
export function headingSkips(source: string): HeadingSkip[] {
  const found: HeadingSkip[] = [];
  let previous = 1;

  for (const block of parseMarkdown(source)) {
    if (block.type !== "heading") continue;

    if (block.level > previous + 1) {
      found.push({
        level: block.level,
        after: previous,
        text: inlineText(block.children),
      });
    }

    previous = block.level;
  }

  return found;
}

/** An image reference the renderer will not turn into a figure. */
export interface ImagePlacementIssue {
  /** The raw reference, for quoting back at the editor. */
  source: string;
  reason: "inline" | "not-a-media-reference" | "malformed-id";
}

/**
 * Image references that will not render, with the reason.
 *
 * The parser's rule is that a figure is a block of its own pointing at a
 * `media` id. Anything else stays literal text, which is visible in the preview
 * but easy to miss — so the admin form reports these before a post is
 * published rather than letting a hospital page ship `![](media:oops)` as
 * words. See the publish checks in `lib/admin/resources/blog-posts.ts`.
 */
export function imagePlacementIssues(source: string): ImagePlacementIssue[] {
  const normalised = source.replace(/\r\n/g, "\n");
  const blockFigures = new Set(
    normalised
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => FIGURE.test(chunk)),
  );

  const issues: ImagePlacementIssue[] = [];

  for (const match of normalised.matchAll(ANY_IMAGE)) {
    const [full, , target] = match;
    if (full === undefined) continue;
    if (blockFigures.has(full.trim())) continue;

    if (target === undefined || !target.startsWith("media:")) {
      issues.push({ source: full, reason: "not-a-media-reference" });
      continue;
    }

    // It names `media:` but the parser rejected it, so either the id is not a
    // uuid or the reference is sitting inside a sentence.
    const alone = normalised
      .split(/\n{2,}/)
      .some((chunk) => chunk.trim() === full.trim());

    issues.push({
      source: full,
      reason: alone ? "malformed-id" : "inline",
    });
  }

  return issues;
}

/**
 * One pass over a line, matching the first of the three inline forms.
 *
 * Order matters: `**` must be tried before `*`, or every strong span would be
 * read as an empty emphasis followed by stray asterisks.
 *
 * The `(?<!!)` is what keeps an image from being read as a link. Without it
 * `![alt](media:x)` matches the link branch, the `!` is orphaned, and a figure
 * an editor misplaced inside a sentence would silently become a hyperlink to
 * `media:x`. With it the whole reference stays literal text, which is visible
 * in the preview and reported by `imagePlacementIssues`.
 */
const INLINE =
  /\*\*([^*]+)\*\*|\*([^*]+)\*|(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;

  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) break;

    if (match.index > 0) {
      out.push({ type: "text", value: rest.slice(0, match.index) });
    }

    const [full, strong, em, linkText, href] = match;

    if (strong !== undefined) {
      out.push({ type: "strong", children: parseInline(strong) });
    } else if (em !== undefined) {
      out.push({ type: "em", children: parseInline(em) });
    } else if (linkText !== undefined && href !== undefined) {
      out.push(
        SAFE_LINK.test(href)
          ? {
              type: "link",
              href,
              external: !href.startsWith("/"),
              children: parseInline(linkText),
            }
          : // An unsafe href degrades to the link's own text. Dropping the
            // markup entirely would silently lose words the author wrote.
            { type: "text", value: linkText },
      );
    }

    rest = rest.slice(match.index + full.length);
  }

  if (rest.length > 0) out.push({ type: "text", value: rest });

  return out;
}

/**
 * Every run of inline nodes in a block, in reading order.
 *
 * One place that knows which block types carry inline children, so adding a
 * block type cannot quietly skip the link check in
 * `lib/blog/internal-links.ts` or the word count below.
 *
 * A figure contributes nothing: its alt text describes the picture rather than
 * continuing the prose, so counting it would inflate the reading time, and a
 * link cannot appear in it.
 */
export function inlineGroups(block: Block): Inline[][] {
  switch (block.type) {
    case "list":
      return block.items;
    case "table":
      return [...block.head.map((cell) => cell), ...block.rows.flat()];
    case "figure":
      return [];
    default:
      return [block.children];
  }
}

/**
 * Plain text of a body, for meta descriptions and reading-time estimates.
 * Markers are stripped rather than rendered, so `**care**` counts as one word.
 *
 * A figure's caption is included and its alt text is not. The caption is prose
 * the reader sees; the alt text is a description of the image for anyone who
 * cannot see it, and it is not part of the article's word count.
 */
export function toPlainText(source: string): string {
  return parseMarkdown(source)
    .flatMap((block) =>
      block.type === "figure"
        ? block.caption === null
          ? []
          : [block.caption]
        : inlineGroups(block).map(inlineText),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) => (node.type === "text" ? node.value : inlineText(node.children)))
    .join("");
}

/** Average adult reading speed, rounded up. Never returns zero. */
export function readingTimeMinutes(source: string): number {
  const words = toPlainText(source).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
