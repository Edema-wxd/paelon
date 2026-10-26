"use client";

import { Copy } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { hoursInputName, HOURS_DAYS } from "@/lib/admin/resource-input";
import { DAY_LABELS } from "@/lib/locations/hours-display";

/** The three control names for one day, as `resource-form.tsx` registers them. */
export interface HoursDayNames {
  open: string;
  close: string;
  closed: string;
}

/**
 * The seven-day opening schedule on `locations.hours`.
 *
 * A `<fieldset>` of real inputs named `hours.<day>.<part>`, so the schedule
 * submits and validates with JavaScript off, and `resourceInput` rebuilds it
 * server-side into the object `adminHoursField` parses. The same names are what
 * react-hook-form registers, so the client and the server validate the identical
 * shape — the rule CLAUDE.md asks for, with no second representation to keep in
 * step.
 *
 * `<input type="time">` rather than a text box: it gives the platform's own
 * picker, the platform's own keyboard handling, and a value that is already
 * "HH:mm" — the format `hoursSchema` wants — without a parser in between.
 *
 * Laid out as one row per day — day, opens, closes, closed — so a week reads
 * as a timetable. Most branches keep the same hours every day, so "Copy
 * Monday to every day" turns fourteen entries into two.
 *
 * Times stay enabled when "Closed" is ticked; they are dimmed instead.
 * Disabling them would drop their values from the submission, so a day ticked
 * closed by mistake loses the hours that were typed, and the tick is exactly
 * the sort of thing people undo. For the same reason the whole schedule is
 * dimmed, not disabled, while the "hours confirmed" box is unticked — the CSS
 * reads the checkbox, so this needs no client state.
 */
export function HoursField({
  name,
  legend,
  hint,
  register,
  error,
  onCopyFirstDay,
}: {
  name: string;
  legend: string;
  hint?: string;
  /** Registers a control and carries its saved value into the server HTML. */
  register: (
    field: string,
  ) => UseFormRegisterReturn & { defaultValue?: string; defaultChecked?: boolean };
  error?: string;
  /** Copy the first day's values onto the rest. Absent hides the button. */
  onCopyFirstDay?: (days: HoursDayNames[]) => void;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const days = HOURS_DAYS.map((day) => ({
    day,
    names: {
      open: hoursInputName(name, day, "open"),
      close: hoursInputName(name, day, "close"),
      closed: hoursInputName(name, day, "closed"),
    },
  }));

  return (
    <fieldset
      aria-describedby={describedBy}
      // Dimmed while the "confirmed" box in the same section is unticked:
      // nothing here is saved until it is. The box carries
      // `data-confirms-hours` (set by resource-form.tsx) because a class has to
      // be a literal string for Tailwind to generate it.
      className="space-y-3 transition-opacity duration-150 [section:has(input[data-confirms-hours]:not(:checked))_&]:opacity-50"
    >
      {/* First child of the fieldset, or it stops naming the group. */}
      <legend className="text-sm font-medium text-foreground">{legend}</legend>

      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}

      <div className="flex justify-end">
        {onCopyFirstDay ? (
          <button
            type="button"
            onClick={() => onCopyFirstDay(days.map((entry) => entry.names))}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors duration-150 hover:bg-secondary"
          >
            <Copy aria-hidden className="size-3.5" />
            Copy {DAY_LABELS[HOURS_DAYS[0]]} to every day
          </button>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border">
        {/* Column headings once, visually; each input keeps its own label for
            assistive tech, which reads "Monday opens", not "Opens". */}
        <div
          aria-hidden
          className="hidden grid-cols-[7rem_1fr_1fr_6rem] gap-3 border-b border-border bg-secondary/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid"
        >
          <span>Day</span>
          <span>Opens</span>
          <span>Closes</span>
          <span>Closed</span>
        </div>

        <ul className="divide-y divide-border">
          {days.map(({ day, names }) => {
            const label = DAY_LABELS[day];
            return (
              <li
                key={day}
                className="grid grid-cols-2 items-center gap-x-3 gap-y-2 px-3 py-2 sm:grid-cols-[7rem_1fr_1fr_6rem]"
              >
                <span className="col-span-2 text-sm font-medium text-primary sm:col-span-1">
                  {label}
                </span>

                {/* Dimmed when this row's "Closed" box is ticked. */}
                <div className="transition-opacity duration-150 [li:has(input[type=checkbox]:checked)_&]:opacity-40">
                  <label htmlFor={`field-${names.open}`} className="sr-only">
                    {label} opens
                  </label>
                  <Input {...register(names.open)} id={`field-${names.open}`} type="time" />
                </div>

                <div className="transition-opacity duration-150 [li:has(input[type=checkbox]:checked)_&]:opacity-40">
                  <label htmlFor={`field-${names.close}`} className="sr-only">
                    {label} closes
                  </label>
                  <Input {...register(names.close)} id={`field-${names.close}`} type="time" />
                </div>

                <label
                  htmlFor={`field-${names.closed}`}
                  className="col-span-2 flex items-center gap-2 text-sm text-foreground sm:col-span-1"
                >
                  <input
                    {...register(names.closed)}
                    id={`field-${names.closed}`}
                    type="checkbox"
                    value="on"
                    className="size-4 rounded border-input accent-brand-navy"
                  />
                  <span>
                    Closed<span className="sr-only"> on {label}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </fieldset>
  );
}
