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
 * Supported: `##`/`###` headings, paragraphs, `-` and `1.` lists, `>` quotes,
 * `**strong**`, `*emphasis*`, `[text](href)`.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; external: boolean; children: Inline[] };

export type Block =
  | { type: "heading"; level: 2 | 3; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; children: Inline[] };

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

  const heading = /^(#{2,3})\s+(.*)$/.exec(chunk);
  if (heading?.[1] && heading[2] !== undefined) {
    return {
      type: "heading",
      level: heading[1].length === 2 ? 2 : 3,
      children: parseInline(heading[2]),
    };
  }

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
 * One pass over a line, matching the first of the three inline forms.
 *
 * Order matters: `**` must be tried before `*`, or every strong span would be
 * read as an empty emphasis followed by stray asterisks.
 */
const INLINE = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/;

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
 * Plain text of a body, for meta descriptions and reading-time estimates.
 * Markers are stripped rather than rendered, so `**care**` counts as one word.
 */
export function toPlainText(source: string): string {
  return parseMarkdown(source)
    .flatMap((block) =>
      block.type === "list"
        ? block.items.map(inlineText)
        : [inlineText(block.children)],
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
