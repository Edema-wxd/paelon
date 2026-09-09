"use client";

import { Field, FieldError, OptionCard, describedBy } from "@/components/booking/field";
import {
  TIME_WINDOW_HINTS,
  TIME_WINDOW_LABELS,
  type StepProps,
  type TimeWindow,
} from "@/components/booking/types";
import { Input } from "@/components/ui/input";
import {
  BOOKING_MAX_DAYS_AHEAD,
  addDaysToIsoDate,
  todayInLagos,
} from "@/lib/validation/primitives";
import { timeWindowValues } from "@/lib/validation/booking";

/**
 * Step 3 — preferred date and time window (master spec §7).
 *
 * A native `<input type="date">` rather than a custom calendar: it is already
 * localised, keyboard-operable and screen-reader-labelled on every target
 * browser, and it costs nothing in the JS budget (spec §13). `min`/`max` mirror
 * `bookingDate()` exactly, so the picker cannot offer a date the server will
 * reject.
 *
 * The clock is read on mount rather than at module load: a tab left open
 * overnight would otherwise keep yesterday's `min`.
 *
 * Time windows are windows, not slots. The hospital confirms an actual time by
 * phone, so nothing here may read as a reserved appointment.
 */
export function StepSchedule({ draft, errors, patch }: StepProps) {
  const today = todayInLagos();
  const latest = addDaysToIsoDate(today, BOOKING_MAX_DAYS_AHEAD);

  return (
    <div className="space-y-8">
      <Field
        id="booking-date"
        label="Which day suits you?"
        error={errors.preferredDate}
        hint={`Any day from today up to ${BOOKING_MAX_DAYS_AHEAD} days ahead. We will confirm the exact time when we call.`}
      >
        <Input
          id="booking-date"
          type="date"
          required
          min={today}
          max={latest}
          value={draft.preferredDate}
          onChange={(event) => patch({ preferredDate: event.target.value })}
          aria-invalid={Boolean(errors.preferredDate)}
          aria-describedby={describedBy("booking-date", {
            error: errors.preferredDate,
            hint: true,
          })}
          className="bg-surface"
        />
      </Field>

      <fieldset>
        <legend className="text-base font-medium">
          What time of day works best?
        </legend>

        {errors.preferredTimeWindow ? (
          <FieldError id="booking-window-error">
            {errors.preferredTimeWindow}
          </FieldError>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {timeWindowValues.map((window) => (
            <OptionCard
              key={window}
              name="preferredTimeWindow"
              value={window}
              checked={draft.preferredTimeWindow === window}
              onSelect={(value) =>
                patch({ preferredTimeWindow: value as TimeWindow })
              }
              title={TIME_WINDOW_LABELS[window]}
              description={TIME_WINDOW_HINTS[window]}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
