"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * A `text[]` column, edited as a list of tags.
 *
 * Each value is a real hidden `<input>` with the field's name, so the list
 * submits as repeated entries and `resourceInput` reads it with `getAll` — the
 * same shape whether or not JavaScript ran. No serialisation, no JSON in a
 * hidden field, nothing to keep in step with the server's parser.
 *
 * ## Why Enter is not the only way in
 *
 * Enter inside a form submits it, so the keydown handler stops that when the
 * box has text — but a "Add" button is there too, because a control whose only
 * affordance is a keystroke is a control some people cannot use. The same goes
 * for removal: each tag has its own button with the value in its accessible
 * name, rather than a bare × that reads as "button" seven times in a row.
 *
 * Added and removed values are announced through the `aria-live` list, since
 * the change happens somewhere other than where focus is.
 */
export function TagInput({
  name,
  id,
  label,
  values,
  onChange,
  maxItems,
  maxLength,
  describedBy,
  invalid,
}: {
  name: string;
  id: string;
  label: string;
  values: readonly string[];
  onChange: (next: string[]) => void;
  maxItems?: number;
  maxLength?: number;
  describedBy?: string;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const full = maxItems !== undefined && values.length >= maxItems;

  function add() {
    const value = draft.trim();
    if (value === "" || full) return;
    // Silently ignoring a duplicate would look like the button did nothing, so
    // the box is cleared either way and the existing tag stays where it is.
    if (!values.includes(value)) onChange([...values, value]);
    setDraft("");
  }

  function remove(value: string) {
    onChange(values.filter((entry) => entry !== value));
  }

  return (
    <div>
      {values.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          value={draft}
          maxLength={maxLength}
          disabled={full}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="w-auto min-w-48 flex-1"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || draft.trim() === "") return;
            event.preventDefault();
            add();
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={full} onClick={add}>
          Add
        </Button>
      </div>

      {full ? (
        <p className="mt-1 text-xs text-muted-foreground">
          That is the maximum of {maxItems}. Remove one to add another.
        </p>
      ) : null}

      <ul aria-live="polite" className="mt-2 flex flex-wrap gap-2 empty:hidden">
        {values.map((value) => (
          <li
            key={value}
            className="flex items-center gap-1 rounded-full bg-secondary py-1 pr-1 pl-3 text-sm text-primary"
          >
            <span>{value}</span>
            <button
              type="button"
              onClick={() => remove(value)}
              className="rounded-full px-2 py-0.5 text-muted-foreground hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span aria-hidden>×</span>
              <span className="sr-only">
                Remove {value} from {label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
