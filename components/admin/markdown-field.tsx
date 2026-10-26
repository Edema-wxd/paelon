"use client";

import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  MarkdownMediaPicker,
  type PickableMedia,
} from "@/components/admin/markdown-media-picker";
import { ArticleBody } from "@/components/site/article-body";
import type { ContentImage } from "@/lib/content";
import { Textarea } from "@/components/ui/textarea";
import {
  applyEdit,
  countWords,
  insertLink,
  toggleBlock,
  toggleInline,
  type BlockCommand,
  type Edit,
  type InlineCommand,
} from "@/lib/admin/markdown-commands";
import { cn } from "@/lib/utils";

/**
 * A Markdown textarea with a syntax toolbar and a live preview (spec §8
 * Content editing).
 *
 * No rich-text editor library, deliberately — §8 says revisit Tiptap only if
 * editors struggle with Markdown after a trial.
 *
 * The preview is `ArticleBody`, **the same renderer the marketing site uses**
 * (decision D1). A second renderer would eventually disagree with the first,
 * and the disagreement would only ever be found in production. It is also why
 * nothing here builds HTML: `lib/markdown.ts` parses to a typed AST and
 * `ArticleBody` turns that into elements, so there is no
 * `dangerouslySetInnerHTML` anywhere on the path.
 *
 * ## The toolbar
 *
 * Buttons insert syntax around the selection; they do not hide it. An editor
 * who learns that `**` is bold can type it next time, which a rich-text editor
 * never teaches. Each is a real `<button type="button">` — inside a form,
 * an unnamed `<button>` submits it.
 *
 * What each button writes comes from `lib/admin/markdown-commands.ts`, which is
 * tested against the parser: only syntax that renders is ever inserted, block
 * commands add the blank lines the parser needs, and pressing a button again
 * undoes it. Edits go through the browser's own text insertion, so Ctrl/⌘-Z
 * steps back through toolbar changes like typed ones; ⌘/Ctrl-B, -I and -K
 * are the usual shortcuts.
 *
 * ## Write and Preview
 *
 * Two modes in the same frame rather than a preview stacked under the
 * textarea, which on a long body rendered somewhere off screen. The textarea
 * stays mounted while previewing — its value still submits, and the undo
 * history survives the round trip.
 *
 * ## Images
 *
 * `figures` adds the Image button, which opens the library picker. A body
 * references an asset by `media.id`, which nobody can type, so the picker is
 * what makes the syntax usable at all.
 *
 * `figureImages` is the set the preview resolves against. It arrives holding
 * the assets the stored body already references — the editor screen resolves
 * those by id — and grows as the editor picks more, so a figure renders in the
 * preview exactly as it will on the site, which is the whole point of sharing
 * the renderer (decision D1). The picker itself needs no list: it queries the
 * library directly, so the whole of it is reachable.
 */

type Command =
  | { kind: "inline"; command: InlineCommand }
  | { kind: "block"; command: BlockCommand }
  | { kind: "link" };

interface Tool {
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  run: Command;
}

/** Grouped by what they act on: words, then lines. */
const TOOL_GROUPS: readonly (readonly Tool[])[] = [
  [
    { label: "Bold", icon: Bold, shortcut: "B", run: { kind: "inline", command: "bold" } },
    { label: "Italic", icon: Italic, shortcut: "I", run: { kind: "inline", command: "italic" } },
    { label: "Link", icon: Link2, shortcut: "K", run: { kind: "link" } },
  ],
  [
    { label: "Heading", icon: Heading2, run: { kind: "block", command: "heading2" } },
    { label: "Subheading", icon: Heading3, run: { kind: "block", command: "heading3" } },
    { label: "Bulleted list", icon: List, run: { kind: "block", command: "bullets" } },
    { label: "Numbered list", icon: ListOrdered, run: { kind: "block", command: "numbers" } },
    { label: "Quote", icon: Quote, run: { kind: "block", command: "quote" } },
  ],
];

/** Tools dropped when a field renders under a heading of its own. */
const HEADING_TOOLS = new Set(["Heading", "Subheading"]);

const SHORTCUTS: Record<string, Command> = {
  b: { kind: "inline", command: "bold" },
  i: { kind: "inline", command: "italic" },
  k: { kind: "link" },
};

const TOOL_BUTTON =
  "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface hover:text-primary active:scale-[0.94] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40";

export function MarkdownField({
  name,
  id,
  value,
  onChange,
  onBlur,
  rows = 10,
  required,
  invalid,
  describedBy,
  figures = false,
  headings = true,
  headingOffset = 0,
  figureImages,
}: {
  name: string;
  id: string;
  /** Controlled: the form owns the value, so validation sees what is typed. */
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  rows?: number;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** Adds the Image button. Off for bodies that cannot hold a figure. */
  figures?: boolean;
  /** `false` hides Heading and Subheading, for text under a heading of its own. */
  headings?: boolean;
  /** Passed to the preview, so headings render at the level the page uses. */
  headingOffset?: 0 | 1;
  /** Assets the stored body already references, for the preview. */
  figureImages?: readonly PickableMedia[];
}) {
  const [mode, setMode] = useState<"write" | "preview">("write");

  /**
   * Assets picked in this session, on top of the ones the body already used.
   *
   * Kept so the preview can render a figure the moment it is placed, without a
   * round trip to re-resolve an id the picker just handed over.
   */
  const [picked, setPicked] = useState<readonly PickableMedia[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewId = useId();

  // An error is about the source, which cannot be fixed from the preview.
  useEffect(() => {
    if (invalid) setMode("write");
  }, [invalid]);

  /**
   * The preview's image map, built from the same list the picker offers.
   *
   * Keyed by id because that is what a figure's `media:` reference holds.
   */
  const previewImages = useMemo<ReadonlyMap<string, ContentImage>>(
    () =>
      new Map(
        [...(figureImages ?? []), ...picked].map((asset) => [
          asset.id,
          {
            url: asset.url,
            alt: asset.alt ?? "",
            width: asset.width,
            height: asset.height,
          },
        ]),
      ),
    [figureImages, picked],
  );

  /**
   * Apply an edit through the browser's own insertion, so it joins the native
   * undo stack. `execCommand` is deprecated but remains the only way to edit a
   * textarea undoably; where it is missing or refuses, the edit is applied
   * through `onChange` instead and only the undo step is lost.
   */
  function applyToTextarea(edit: Edit) {
    const textarea = textareaRef.current;
    const expected = applyEdit(value, edit);
    if (!textarea) {
      onChange(expected);
      return;
    }

    textarea.focus();
    textarea.setSelectionRange(edit.from, edit.to);
    const inserted =
      edit.insert.length > 0
        ? document.execCommand("insertText", false, edit.insert)
        : document.execCommand("delete");

    if (inserted && textarea.value === expected) {
      textarea.setSelectionRange(edit.select.start, edit.select.end);
      return;
    }

    onChange(expected);
    // After the state flush, or the textarea still holds the old value and
    // the offsets point at the wrong text.
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(edit.select.start, edit.select.end);
    });
  }

  function run(command: Command) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const selection = { start: textarea.selectionStart, end: textarea.selectionEnd };

    const edit =
      command.kind === "inline"
        ? toggleInline(value, selection, command.command)
        : command.kind === "block"
          ? toggleBlock(value, selection, command.command)
          : insertLink(value, selection);

    applyToTextarea(edit);
  }

  /**
   * Place a figure at the caret, as a block of its own.
   *
   * Surrounded by blank lines, because the parser only treats an image as a
   * figure when it is its own block — one dropped into the middle of a
   * paragraph stays literal text. Inserting the separators is what stops the
   * commonest way to get that wrong.
   *
   * The caption is left empty with the caret inside it, so typing writes one
   * and moving on without typing leaves `""`, which renders no `<figcaption>`.
   */
  function insertFigure(asset: PickableMedia) {
    setPicked((current) =>
      current.some((entry) => entry.id === asset.id) ? current : [...current, asset],
    );
    setMode("write");

    const textarea = textareaRef.current;
    const at = textarea ? textarea.selectionStart : value.length;

    const from = value.slice(0, at).replace(/\s+$/, "").length;
    const rest = value.slice(at);
    const to = at + (rest.length - rest.replace(/^\s+/, "").length);

    const reference = `![${asset.alt ?? ""}](media:${asset.id} "")`;
    const head = from > 0 ? "\n\n" : "";
    const tail = to < value.length ? "\n\n" : "";
    const caption = from + head.length + reference.length - 2;

    applyToTextarea({
      from,
      to,
      insert: `${head}${reference}${tail}`,
      select: { start: caption, end: caption },
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    const command = SHORTCUTS[event.key.toLowerCase()];
    if (!command) return;
    event.preventDefault();
    run(command);
  }

  const words = countWords(value);
  const writing = mode === "write";

  return (
    <div>
      <div
        className={cn(
          "overflow-hidden rounded-md border border-input transition-[border-color,box-shadow] duration-150",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          invalid && "border-destructive",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-secondary/50 px-1.5 py-1">
          {/* Write / Preview. Buttons with `aria-pressed`, not ARIA tabs:
              there are two states and no panel switching beyond that. */}
          <div className="flex rounded-md bg-secondary p-0.5">
            {(["write", "preview"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                aria-controls={option === "preview" ? previewId : id}
                onClick={() => setMode(option)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                  mode === option
                    ? "bg-surface text-primary shadow-sm"
                    : "text-muted-foreground hover:text-primary",
                )}
              >
                {option === "write" ? "Write" : "Preview"}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Formatting"
            className="flex flex-wrap items-center gap-0.5"
          >
            {TOOL_GROUPS.map((group) =>
              headings ? group : group.filter((tool) => !HEADING_TOOLS.has(tool.label)),
            ).map((group, index) => (
              <div key={index} className="flex items-center gap-0.5">
                {index > 0 ? (
                  <span aria-hidden className="mx-1 h-5 w-px bg-border" />
                ) : null}
                {group.map((tool) => {
                  const Icon = tool.icon;
                  const hint = tool.shortcut ? `${tool.label} (⌘/Ctrl+${tool.shortcut})` : tool.label;
                  return (
                    <button
                      key={tool.label}
                      type="button"
                      title={hint}
                      disabled={!writing}
                      onClick={() => run(tool.run)}
                      className={TOOL_BUTTON}
                    >
                      <Icon aria-hidden className="size-4" />
                      <span className="sr-only">{tool.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}

            {figures ? (
              <>
                <span aria-hidden className="mx-1 h-5 w-px bg-border" />
                <MarkdownMediaPicker
                  onPick={insertFigure}
                  iconOnly
                  label="Insert image"
                  triggerClassName={TOOL_BUTTON}
                />
              </>
            ) : null}
          </div>
        </div>

        <Textarea
          ref={textareaRef}
          id={id}
          name={name}
          rows={rows}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            "rounded-none border-0 bg-surface px-4 py-3 text-[15px] leading-relaxed shadow-none focus-visible:ring-0",
            !writing && "hidden",
          )}
        />

        {/* Kept in the tree and toggled with `hidden`, so the preview does not
            remount and `aria-controls` always points at something. */}
        <div
          id={previewId}
          hidden={writing}
          role="region"
          aria-label="Preview"
          className="min-h-40 bg-surface px-4 py-3"
        >
          {value.trim() ? (
            <ArticleBody source={value} images={previewImages} headingOffset={headingOffset} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/30 px-3 py-1.5 text-xs text-muted-foreground">
          <span aria-live="off" className="tabular-nums">
            {words} {words === 1 ? "word" : "words"}
          </span>
          <span>{writing ? "Markdown" : "Preview uses the live site’s renderer"}</span>
        </div>
      </div>

      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer rounded-sm hover:text-primary">
          Formatting help
        </summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt><code>**bold**</code></dt><dd>Bold. <code>*italic*</code> for italic — they cannot be combined.</dd>
          <dt><code>[text](/path)</code></dt><dd>A link. Site pages start with <code>/</code>; they must exist.</dd>
          {headings ? (
            <>
              <dt><code>## Heading</code></dt><dd><code>###</code> for a subheading. On a line of its own, with a blank line before and after.</dd>
            </>
          ) : (
            <>
              <dt>Headings</dt><dd>Not used here — this text sits under a heading of its own. Use bold for emphasis.</dd>
            </>
          )}
          <dt><code>- item</code></dt><dd>Bulleted list; <code>1. item</code> for numbered. One item per line.</dd>
          <dt><code>&gt; text</code></dt><dd>Quote.</dd>
          <dt><code>| a | b |</code></dt><dd>Table: a header row, then <code>| --- | --- |</code>, then rows.</dd>
          <dt>Not supported</dt><dd>Code, strikethrough, horizontal rules and HTML show as plain text.</dd>
        </dl>
      </details>
    </div>
  );
}
