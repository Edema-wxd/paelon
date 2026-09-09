import { Check } from "lucide-react";

/**
 * Six-step progress indicator (master spec §7: "visible at all times").
 *
 * An ordered list rather than a row of divs: the count and the position in it
 * are the information, and a list conveys both to assistive tech without extra
 * ARIA. State is carried by the step word ("Done", "Current") and a check
 * mark, never by colour alone (spec §12).
 *
 * The bar is not the live region — announcing the whole rail on every step
 * change is noise. `booking-wizard.tsx` announces the new step's heading.
 */
export function BookingProgress({
  labels,
  current,
}: {
  labels: readonly string[];
  current: number;
}) {
  return (
    <nav aria-label="Booking progress">
      <p className="text-sm font-medium text-muted-foreground">
        Step {current + 1} of {labels.length}
      </p>

      <ol className="mt-3 flex gap-1.5">
        {labels.map((label, index) => {
          const done = index < current;
          const isCurrent = index === current;

          return (
            <li key={label} className="min-w-0 flex-1">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={`block h-1.5 rounded-full ${
                  done || isCurrent ? "bg-accent" : "bg-border"
                }`}
              />
              <span className="sr-only">
                {index + 1}. {label}
                {done ? " — Done" : isCurrent ? " — Current step" : ""}
              </span>
            </li>
          );
        })}
      </ol>

      {/* The full trail is a lot of chrome on a phone; the current step's name
          carries the same meaning in the space available. */}
      <ol className="mt-3 hidden gap-x-6 gap-y-2 sm:flex sm:flex-wrap" aria-hidden>
        {labels.map((label, index) => (
          <li
            key={label}
            className={`flex items-center gap-1.5 text-sm ${
              index === current
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            }`}
          >
            {index < current ? (
              <Check className="size-4 text-accent" aria-hidden />
            ) : null}
            {label}
          </li>
        ))}
      </ol>
    </nav>
  );
}
