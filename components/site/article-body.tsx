import Link from "next/link";

import type { Block, Inline } from "@/lib/markdown";
import { parseMarkdown } from "@/lib/markdown";

/**
 * Renders a blog post body (spec §6).
 *
 * Builds React elements from the AST in `lib/markdown`, so nothing reaches the
 * DOM as raw HTML. Typography is set here rather than through a prose plugin —
 * `@tailwindcss/typography` is not an approved dependency (spec §2), and a
 * dozen classnames is a smaller cost than a dependency that also has opinions
 * about colour.
 *
 * Headings start at `h2`: the post title owns the single `h1` on the page, and
 * spec §12 forbids skipped levels.
 */
export function ArticleBody({ source }: { source: string }) {
  const blocks = parseMarkdown(source);

  return (
    <div className="max-w-2xl">
      {blocks.map((block, index) => (
        <BlockNode key={index} block={block} />
      ))}
    </div>
  );
}

function BlockNode({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      return block.level === 2 ? (
        <h2 className="mt-12 text-2xl text-primary first:mt-0 lg:text-3xl">
          <InlineNodes nodes={block.children} />
        </h2>
      ) : (
        <h3 className="mt-10 text-xl text-primary first:mt-0 lg:text-2xl">
          <InlineNodes nodes={block.children} />
        </h3>
      );

    case "paragraph":
      return (
        <p className="mt-6 text-base leading-relaxed text-foreground/80 first:mt-0 lg:text-lg">
          <InlineNodes nodes={block.children} />
        </p>
      );

    case "list": {
      const className =
        "mt-6 space-y-3 ps-6 text-base leading-relaxed text-foreground/80 lg:text-lg";
      const items = block.items.map((item, index) => (
        <li key={index} className="ps-1">
          <InlineNodes nodes={item} />
        </li>
      ));

      return block.ordered ? (
        <ol className={`${className} list-decimal`}>{items}</ol>
      ) : (
        <ul className={`${className} list-disc`}>{items}</ul>
      );
    }

    case "quote":
      return (
        <blockquote className="mt-8 border-s-4 border-accent ps-6 text-lg leading-relaxed text-primary italic lg:text-xl">
          <InlineNodes nodes={block.children} />
        </blockquote>
      );
  }
}

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineNode key={index} node={node} />
      ))}
    </>
  );
}

function InlineNode({ node }: { node: Inline }) {
  switch (node.type) {
    case "text":
      return node.value;

    case "strong":
      return (
        <strong className="font-semibold text-primary">
          <InlineNodes nodes={node.children} />
        </strong>
      );

    case "em":
      return (
        <em>
          <InlineNodes nodes={node.children} />
        </em>
      );

    case "link": {
      const className =
        "text-accent underline underline-offset-4 hover:no-underline";

      // `next/link` prefetches, which is right for an internal route and wrong
      // for someone else's server.
      return node.external ? (
        <a
          href={node.href}
          className={className}
          rel="noopener noreferrer"
          target="_blank"
        >
          <InlineNodes nodes={node.children} />
        </a>
      ) : (
        <Link href={node.href} className={className}>
          <InlineNodes nodes={node.children} />
        </Link>
      );
    }
  }
}
