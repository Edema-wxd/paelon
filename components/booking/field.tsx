import type { ReactNode } from "react";

/**
 * Field furniture shared by the six booking steps.
 *
 * Exists so the label/hint/error triple has one definition. Placeholder-as-
 * label is forbidden (spec §12), so every control gets a real `<label>`, and
 * the error is bound to the control by id rather than signalled with colour.
 */

/**
 * Ids for `aria-describedby`, in the order a screen reader should hear them:
 * the error first, because it is what stops the form being submitted.
 *
 * Takes presence flags rather than the content itself — the caller already
 * knows whether it passed a hint to `Field`, and passing the node twice
 * invites the two from drifting apart.
 */
export function describedBy(
  id: string,
  options: { error?: string | undefined; hint?: boolean },
): string | undefined {
  const ids = [
    options.error ? `${id}-error` : null,
    options.hint ? `${id}-hint` : null,
  ].filter(Boolean);

  return ids.length > 0 ? ids.join(" ") : undefined;
}

interface FieldProps {
  id: string;
  label: ReactNode;
  /** Renders "(optional)" after the label. Optional fields must say so. */
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}

export function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-base font-medium">
        {label}
        {optional ? (
          <span className="font-normal text-muted-foreground"> (optional)</span>
        ) : null}
      </label>
      <div className="mt-2">{children}</div>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      {hint ? (
        <p id={`${id}-hint`} className="mt-2 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FieldError({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <p id={id} className="mt-2 text-sm text-destructive">
      {children}
    </p>
  );
}

/**
 * A radio rendered as a selectable card (spec §7: "cards, not a dropdown").
 *
 * A real `<input type="radio">` sits behind the card, so arrow-key group
 * navigation, form semantics and the focus ring all come for free — a
 * `<div onClick>` would have to reimplement each of them, usually badly.
 * Selection is shown by border weight and a check mark as well as colour.
 */
export function OptionCard({
  name,
  value,
  checked,
  onSelect,
  title,
  description,
  describedById,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  title: ReactNode;
  description?: ReactNode;
  describedById?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 bg-surface p-4 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 ${
        checked ? "border-accent" : "border-border hover:border-accent/50"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        aria-describedby={describedById}
        className="mt-1 size-5 shrink-0 accent-accent"
      />
      <span className="min-w-0">
        <span className="block text-base font-medium">{title}</span>
        {description ? (
          <span className="mt-1 block text-sm text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
