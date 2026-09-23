"use client";

import { useId, useRef, useState } from "react";

import { ArticleBody } from "@/components/site/article-body";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
 */

interface Snippet {
  label: string;
  /** Inserted before the selection. */
  prefix: string;
  /** Inserted after it. Empty for a line-level prefix like `## `. */
  suffix: string;
  /** Shown when nothing is selected, and left selected so it can be typed over. */
  placeholder: string;
}

const SNIPPETS: readonly Snippet[] = [
  { label: "Bold", prefix: "**", suffix: "**", placeholder: "bold text" },
  { label: "Italic", prefix: "_", suffix: "_", placeholder: "italic text" },
  { label: "Heading", prefix: "## ", suffix: "", placeholder: "Heading" },
  { label: "Link", prefix: "[", suffix: "](/path)", placeholder: "link text" },
  { label: "List", prefix: "- ", suffix: "", placeholder: "item" },
];

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
}) {
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewId = useId();

  function insert(snippet: Snippet) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd } = textarea;
    const selected = value.slice(selectionStart, selectionEnd);
    const body = selected || snippet.placeholder;
    const next =
      value.slice(0, selectionStart) +
      snippet.prefix +
      body +
      snippet.suffix +
      value.slice(selectionEnd);

    onChange(next);

    // Put the caret around the inserted text, so typing replaces the
    // placeholder instead of appending to it. After the state flush, or the
    // textarea still holds the old value and the offsets are wrong.
    const from = selectionStart + snippet.prefix.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(from, from + body.length);
    });
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {SNIPPETS.map((snippet) => (
          <button
            key={snippet.label}
            type="button"
            onClick={() => insert(snippet)}
            className="rounded-md border border-border px-2 py-1 text-xs text-primary hover:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {snippet.label}
          </button>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          aria-expanded={showPreview}
          aria-controls={previewId}
          onClick={() => setShowPreview((open) => !open)}
        >
          {showPreview ? "Hide preview" : "Preview"}
        </Button>
      </div>

      <Textarea
        ref={textareaRef}
        id={id}
        name={name}
        rows={rows}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="font-mono text-sm"
      />

      {/* Kept in the tree and toggled with `hidden`, so the preview does not
          remount — and `aria-controls` above always points at something. */}
      <div
        id={previewId}
        hidden={!showPreview}
        className="mt-3 rounded-xl border border-border bg-white p-4"
      >
        <p className="mb-2 text-xs text-muted-foreground">
          Preview — the same renderer the live site uses.
        </p>
        {value.trim() ? (
          <ArticleBody source={value} />
        ) : (
          <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
        )}
      </div>
    </div>
  );
}
