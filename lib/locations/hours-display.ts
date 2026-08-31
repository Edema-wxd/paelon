import {
  DAYS,
  isTwentyFourHours,
  type DayHours,
  type DayKey,
  type Hours,
} from "@/lib/validation/hours";

/**
 * Display helpers for `locations.hours`.
 *
 * Kept out of the components so they can be unit tested, and so the "hours
 * were never supplied" case has one definition rather than one per template.
 */

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/**
 * True only when all seven days are present.
 *
 * A seeded branch whose hours Francis has not confirmed stores `{}` (see
 * lib/db/schema.ts), and the JSON seed omits the key entirely. Both mean the
 * same thing: show the pending note, never a guessed schedule. Publishing
 * wrong opening hours for a hospital sends someone to a locked gate.
 */
export function hasPublishedHours(
  hours: Hours | Record<string, never> | undefined,
): hours is Hours {
  return hours != null && DAYS.every((day) => day in hours);
}

/** "08:00" to "8:00 am". Input is already validated as HH:mm on write. */
export function formatTime(value: string): string {
  const [rawHour, rawMinute] = value.split(":");
  const hour = Number(rawHour);
  const minute = rawMinute ?? "00";
  const suffix = hour < 12 ? "am" : "pm";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${suffix}`;
}

/** One day's hours as a sentence fragment. */
export function describeDay(day: DayHours): string {
  if (day.closed) return "Closed";
  if (isTwentyFourHours(day)) return "Open 24 hours";
  return `${formatTime(day.open)} to ${formatTime(day.close)}`;
}

// Hospital-local, not visitor-local: a patient in London reading this page
// needs to know whether the Lagos front desk is open, not whether it would be
// open in their own timezone.
const LAGOS_WEEKDAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  weekday: "short",
});

/**
 * Today's day key in Africa/Lagos.
 *
 * `en-GB` short weekdays are exactly "Mon" through "Sun", which lowercase to
 * the `DAYS` keys. The fallback is unreachable in practice and exists so the
 * return type stays non-nullable for callers.
 */
export function todayInLagos(now: Date = new Date()): DayKey {
  const short = LAGOS_WEEKDAY.format(now).toLowerCase().slice(0, 3);
  return DAYS.find((day) => day === short) ?? "mon";
}

/**
 * `openingHoursSpecification` entries for schema.org `Hospital` (spec §11).
 *
 * Closed days are omitted rather than emitted with empty times: Google reads an
 * absent day as closed, and an entry with no opens/closes is invalid structured
 * data. Returns an empty array when the schedule has not been confirmed, so
 * callers can drop the property instead of publishing a hollow one.
 */
export function toOpeningHoursSpecification(
  hours: Hours | Record<string, never> | undefined,
): { "@type": "OpeningHoursSpecification"; dayOfWeek: string; opens: string; closes: string }[] {
  if (!hasPublishedHours(hours)) return [];

  return DAYS.flatMap((day) => {
    const value = hours[day];
    if (value.closed) return [];
    return [
      {
        "@type": "OpeningHoursSpecification" as const,
        dayOfWeek: DAY_LABELS[day],
        opens: value.open,
        closes: value.close,
      },
    ];
  });
}
