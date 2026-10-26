"use client";

import { cn } from "@/lib/utils";

/** One pickable row. Mirrors `ContentOption`, without importing the server module. */
export interface SelectOption {
  id: string;
  label: string;
  published: boolean;
}

/**
 * The rows of a join table, chosen as a set of checkboxes.
 *
 * Not a native `<select multiple>`, which this used to be: choosing a second
 * branch there means Ctrl/⌘-click, and a plain click silently deselects every
 * other choice — so one careless click while scrolling dropped a service from
 * every branch page on the next save. A checkbox per row has no such mode.
 *
 * It submits exactly what the select did — one `name=<id>` entry per chosen
 * row — still with no JavaScript, and each box is a real labelled control, so
 * it needs no ARIA. The group's label and hint come from the surrounding
 * `<fieldset>` in `resource-form.tsx`.
 *
 * Drafts are listed and labelled. A service is routinely attached to a branch
 * that is still being written, and hiding drafts would quietly drop the join
 * the next time anyone saved the row.
 */
export function MultiSelectField({
  name,
  id,
  options,
  value,
  onChange,
  emptyLabel,
  describedBy,
  invalid,
}: {
  name: string;
  id: string;
  options: readonly SelectOption[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  emptyLabel?: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  if (options.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
        {emptyLabel ?? "Nothing to choose from yet."}
      </p>
    );
  }

  const chosen = new Set(value);

  function toggle(optionId: string, checked: boolean) {
    // Rebuilt in option order, so the submitted list does not depend on the
    // order the boxes were clicked in.
    const next = new Set(chosen);
    if (checked) next.add(optionId);
    else next.delete(optionId);
    onChange(options.map((option) => option.id).filter((candidate) => next.has(candidate)));
  }

  return (
    <div
      id={id}
      tabIndex={-1}
      aria-describedby={describedBy}
      className={cn(
        "grid gap-1.5 rounded-md outline-none sm:grid-cols-2",
        invalid && "ring-2 ring-destructive/40",
      )}
    >
      {options.map((option) => {
        const checked = chosen.has(option.id);
        const boxId = `${id}-${option.id}`;
        return (
          <label
            key={option.id}
            htmlFor={boxId}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors duration-150",
              checked
                ? "border-primary/40 bg-secondary/60 text-primary"
                : "border-border text-foreground hover:border-primary/30",
            )}
          >
            <input
              id={boxId}
              type="checkbox"
              name={name}
              value={option.id}
              checked={checked}
              onChange={(event) => toggle(option.id, event.target.checked)}
              className="size-4 shrink-0 rounded border-input accent-brand-navy"
            />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.published ? null : (
              <span className="text-xs text-muted-foreground">Draft</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
