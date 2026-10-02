"use client";

import type { UseFormRegisterReturn } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { hoursInputName, HOURS_DAYS } from "@/lib/admin/resource-input";
import { DAY_LABELS } from "@/lib/locations/hours-display";

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
 * Times stay enabled when "Closed" is ticked. Disabling them would drop their
 * values from the submission, so a day ticked closed by mistake loses the hours
 * that were typed, and the tick is exactly the sort of thing people undo.
 */
export function HoursField({
  name,
  legend,
  hint,
  register,
  error,
}: {
  name: string;
  legend: string;
  hint?: string;
  register: (field: string) => UseFormRegisterReturn;
  error?: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <fieldset aria-describedby={describedBy} className="space-y-3">
      <legend className="text-sm font-medium text-foreground">{legend}</legend>

      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2">
        {HOURS_DAYS.map((day) => {
          const openId = `field-${hoursInputName(name, day, "open")}`;
          const closeId = `field-${hoursInputName(name, day, "close")}`;
          const closedId = `field-${hoursInputName(name, day, "closed")}`;

          return (
            <li
              key={day}
              className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-md border border-border bg-white p-3"
            >
              <p className="w-24 shrink-0 text-sm font-medium text-primary">
                {DAY_LABELS[day]}
              </p>

              <div className="space-y-1">
                <label htmlFor={openId} className="block text-xs text-muted-foreground">
                  Opens
                </label>
                <Input
                  {...register(hoursInputName(name, day, "open"))}
                  id={openId}
                  type="time"
                  className="w-36"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor={closeId} className="block text-xs text-muted-foreground">
                  Closes
                </label>
                <Input
                  {...register(hoursInputName(name, day, "close"))}
                  id={closeId}
                  type="time"
                  className="w-36"
                />
              </div>

              <div className="flex items-center gap-2 pb-2">
                <input
                  {...register(hoursInputName(name, day, "closed"))}
                  id={closedId}
                  type="checkbox"
                  value="on"
                  className="size-4 rounded border-input"
                />
                <label htmlFor={closedId} className="text-sm text-foreground">
                  Closed
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
