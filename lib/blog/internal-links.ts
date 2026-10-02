import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";

/**
 * The internal links inside a post body, for Conversion baseline item 14.
 *
 * CLAUDE.md: "each post body carries at least two contextual links to real site
 * routes … written as `[descriptive text](/path)` in the Markdown body". This
 * module is the half of that rule which needs nothing but the source text — how
 * many internal links there are, and which paths they point at. Whether a path
 * *resolves* is a question about rows, and it lives in `lib/blog/link-targets.ts`.
 *
 * Split that way so the count rule can run on the client. The admin form
 * validates with the same Zod schema on both sides (CLAUDE.md), and a schema
 * that imported a repository would drag the Neon driver into the browser
 * bundle — the rule `lib/content.ts` carries for the marketing site.
 *
 * It reads the AST from `lib/markdown.ts` rather than running its own regex
 * over the source. That is the renderer the live article uses, so "a link" here
 * means exactly what the reader will be able to click: a `[text](/path)` inside
 * a code-free paragraph, heading, list item or quote, including one nested in
 * bold or italics. An unsafe href never appears, because `parseMarkdown`
 * degrades those to plain text before this sees them.
 */

/** Conversion baseline item 14. Two, in the sentences they belong to. */
export const MIN_INTERNAL_LINKS = 2;

export interface InternalLink {
  /** The href as written, fragment and query included. */
  href: string;
  /** The route it names: no fragment, no query, no trailing slash. */
  path: string;
}

/**
 * `/services/cardiology/?utm=x#fees` → `/services/cardiology`.
 *
 * Fragment and query are dropped because neither takes part in routing: a link
 * to `/contact#form` is a link to `/contact`, and refusing it as unresolvable
 * would be a lie. The trailing slash goes for the same reason, except on the
 * homepage, where `/` is the whole path.
 */
export function normalisePath(href: string): string {
  const path = href.split("#")[0]?.split("?")[0] ?? "";
  if (path === "" || path === "/") return "/";
  return path.replace(/\/+$/, "");
}

/**
 * Every internal link in a body, in document order, duplicates included.
 *
 * Duplicates are kept deliberately: `internalLinks(body).length` is the count
 * the baseline rule is written against, and two links to the same page is one
 * destination, not two. `uniquePaths` is there for the resolution check, which
 * has no reason to ask the database about the same slug twice.
 */
export function internalLinks(source: string): InternalLink[] {
  const found: InternalLink[] = [];

  for (const block of parseMarkdown(source)) {
    for (const nodes of inlineGroups(block)) {
      collect(nodes, found);
    }
  }

  return found;
}

/** The distinct routes a body links to, for a batched resolution check. */
export function uniquePaths(links: readonly InternalLink[]): string[] {
  return [...new Set(links.map((link) => link.path))];
}

/** Each run of inline nodes in a block. A list contributes one per item. */
function inlineGroups(block: Block): Inline[][] {
  return block.type === "list" ? block.items : [block.children];
}

function collect(nodes: readonly Inline[], found: InternalLink[]): void {
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        break;

      case "link":
        // `external` is `parseMarkdown`'s own answer, not a second guess at it.
        // Everything it calls internal starts with a single `/`, which is what
        // makes the path below a route rather than someone else's origin.
        if (!node.external) {
          found.push({ href: node.href, path: normalisePath(node.href) });
        }
        // A link cannot nest inside a link, but its text can hold emphasis, so
        // there is nothing further to walk here.
        break;

      default:
        collect(node.children, found);
    }
  }
}
