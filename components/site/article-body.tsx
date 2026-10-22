import Image from "next/image";
import Link from "next/link";

import type { ContentImage } from "@/lib/content";
import type { Block, ColumnAlign, Inline } from "@/lib/markdown";
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
 *
 * ## Images
 *
 * `images` resolves the `media` ids the body's figures reference. The caller
 * does the database work — `collectMediaIds` lists what to fetch — so this
 * stays a pure function of its props and the admin preview can render the same
 * component against the same map (decision D1).
 *
 * A figure whose id is missing from the map, or whose row has no dimensions,
 * renders as its alt text in a caption rather than as an image. Guessing a
 * ratio would ship a layout shift against a hard CLS budget (spec §13), and
 * showing nothing would silently drop content the author placed.
 */
export function ArticleBody({
  source,
  images,
}: {
  source: string;
  /** Resolved `media` rows, keyed by id. Omit when a body has no figures. */
  images?: ReadonlyMap<string, ContentImage>;
}) {
  const blocks = parseMarkdown(source);

  return (
    <div className="max-w-2xl">
      {blocks.map((block, index) => (
        <BlockNode key={index} block={block} images={images} />
      ))}
    </div>
  );
}

function BlockNode({
  block,
  images,
}: {
  block: Block;
  images?: ReadonlyMap<string, ContentImage>;
}) {
  switch (block.type) {
    case "heading": {
      if (block.level === 2) {
        return (
          <h2 className="mt-12 text-2xl text-primary first:mt-0 lg:text-3xl">
            <InlineNodes nodes={block.children} />
          </h2>
        );
      }

      if (block.level === 3) {
        return (
          <h3 className="mt-10 text-xl text-primary first:mt-0 lg:text-2xl">
            <InlineNodes nodes={block.children} />
          </h3>
        );
      }

      return (
        <h4 className="mt-8 text-lg font-semibold text-primary first:mt-0 lg:text-xl">
          <InlineNodes nodes={block.children} />
        </h4>
      );
    }

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

    case "figure":
      return <FigureNode block={block} images={images} />;

    case "table":
      return <TableNode block={block} />;
  }
}

/**
 * A block-level image, or its alt text when the asset cannot be rendered.
 *
 * `sizes` describes the real layout: the body column is capped at `max-w-2xl`
 * (42rem / 672px) and is full-width below that, so the browser never fetches a
 * 2000px file to paint a 672px box.
 *
 * Never `priority`. A figure inside a body is below the fold by definition —
 * the hero image above it is the LCP candidate, and marking both would make
 * them compete for the same early bandwidth (spec §13).
 */
function FigureNode({
  block,
  images,
}: {
  block: Extract<Block, { type: "figure" }>;
  images?: ReadonlyMap<string, ContentImage>;
}) {
  const image = images?.get(block.mediaId);

  // Unresolvable: the media row is gone, or predates the dimensions migration.
  // The alt text is the content that survives, so it is what renders.
  if (!image || image.width === null || image.height === null) {
    return (
      <p className="mt-8 border-s-4 border-border ps-6 text-sm text-muted-foreground">
        {block.caption ?? block.alt}
      </p>
    );
  }

  return (
    <figure className="mt-8">
      <Image
        src={image.url}
        alt={block.alt || image.alt}
        width={image.width}
        height={image.height}
        sizes="(min-width: 42rem) 42rem, 100vw"
        className="h-auto w-full rounded-lg"
      />
      {block.caption ? (
        <figcaption className="mt-3 text-sm text-muted-foreground">
          {block.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

const ALIGN_CLASS: Record<Exclude<ColumnAlign, null>, string> = {
  left: "text-start",
  center: "text-center",
  right: "text-end",
};

function alignClass(align: ColumnAlign): string {
  return align === null ? "text-start" : ALIGN_CLASS[align];
}

/**
 * A data table.
 *
 * `scope="col"` on every header cell, because a table without it is an
 * unlabelled grid to a screen reader (spec §12). Wrapped in a horizontally
 * scrollable region with `tabIndex={0}` so the overflow is reachable by
 * keyboard — a scroll container that only a pointer can move is a trap on a
 * phone, which is where most of this traffic is.
 */
function TableNode({ block }: { block: Extract<Block, { type: "table" }> }) {
  return (
    <div
      className="mt-8 overflow-x-auto"
      // `role`/`tabIndex` make the scrollable area focusable and announced.
      role="region"
      aria-label="Table"
      tabIndex={0}
    >
      <table className="w-full border-collapse text-base lg:text-lg">
        <thead>
          <tr className="border-b-2 border-border">
            {block.head.map((cell, index) => (
              <th
                key={index}
                scope="col"
                className={`py-3 pe-4 font-semibold text-primary ${alignClass(
                  block.align[index] ?? null,
                )}`}
              >
                <InlineNodes nodes={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`py-3 pe-4 leading-relaxed text-foreground/80 ${alignClass(
                    block.align[cellIndex] ?? null,
                  )}`}
                >
                  <InlineNodes nodes={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
