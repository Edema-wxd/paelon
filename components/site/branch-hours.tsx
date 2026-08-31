import { PendingNote } from "@/components/site/pending-note";
import { toTelHref } from "@/lib/content";
import {
  DAY_LABELS,
  describeDay,
  hasPublishedHours,
  todayInLagos,
} from "@/lib/locations/hours-display";
import { DAYS } from "@/lib/validation/hours";
import type { Hours } from "@/lib/validation/hours";

interface BranchHoursProps {
  hours: Hours | Record<string, never> | undefined;
  /** Offered as the fallback when the schedule has not been confirmed. */
  phone: string;
  branchName: string;
}

/**
 * The seven-day schedule for one branch, or an honest note when it has not
 * been supplied.
 *
 * Today is marked with the word "Today" and a heavier weight, not with colour
 * alone (spec §12).
 */
export function BranchHours({ hours, phone, branchName }: BranchHoursProps) {
  if (!hasPublishedHours(hours)) {
    return (
      <PendingNote
        action={
          <a
            href={toTelHref(phone)}
            className="rounded-md text-sm font-medium text-accent underline underline-offset-4"
          >
            Call {branchName} on {phone}
          </a>
        }
      >
        {/* TODO(seed): locations.json carries no `hours`. Publishing a guessed
            schedule for a hospital would send someone to a locked gate, so the
            gap is stated instead. See seed/README.md. */}
        Opening hours for this branch have not been confirmed. Call the front
        desk and someone will tell you when to come in.
      </PendingNote>
    );
  }

  const today = todayInLagos();

  return (
    <table className="w-full border-collapse text-base">
      <caption className="sr-only">
        Opening hours for {branchName}, in Lagos time
      </caption>
      <tbody>
        {DAYS.map((day) => {
          const isToday = day === today;
          return (
            <tr key={day} className="border-b border-border last:border-b-0">
              <th
                scope="row"
                className={`py-3 pr-4 text-left font-normal ${
                  isToday ? "font-medium text-foreground" : "text-foreground"
                }`}
              >
                {DAY_LABELS[day]}
                {isToday ? (
                  <span className="ml-2 rounded-sm bg-primary px-1.5 py-0.5 text-xs font-medium uppercase tracking-[0.1em] text-primary-foreground">
                    Today
                  </span>
                ) : null}
              </th>
              <td
                className={`py-3 text-right tabular-nums ${
                  isToday ? "font-medium" : "text-muted-foreground"
                }`}
              >
                {describeDay(hours[day])}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
