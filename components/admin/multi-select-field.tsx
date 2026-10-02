"use client";

/** One pickable row. Mirrors `ContentOption`, without importing the server module. */
export interface SelectOption {
  id: string;
  label: string;
  published: boolean;
}

/**
 * The rows of a join table, chosen from a list.
 *
 * A native `<select multiple>`, not a combobox: it submits repeated entries
 * with no JavaScript, it is keyboard- and screen-reader-operable without a line
 * of ARIA, and a listbox widget here would be a state library's worth of code
 * for a list of branches. The hint below spells out how to select more than one
 * because that is the one thing a multiple select does not announce.
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
      <p className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
        {emptyLabel ?? "Nothing to choose from yet."}
      </p>
    );
  }

  return (
    <select
      id={id}
      name={name}
      multiple
      size={Math.min(options.length, 8)}
      value={[...value]}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(event) =>
        onChange(
          Array.from(event.target.selectedOptions, (option) => option.value),
        )
      }
      className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
          {option.published ? "" : " (draft)"}
        </option>
      ))}
    </select>
  );
}
