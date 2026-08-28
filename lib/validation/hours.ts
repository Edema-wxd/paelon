import { z } from "zod";

/**
 * Opening hours, stored as jsonb on `locations.hours` and validated on every
 * write (backend spec §4). Times are "HH:mm" 24h, hospital-local (Africa/Lagos).
 */

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times must be HH:mm, 24-hour.");

const openDay = z
  .object({
    closed: z.literal(false).optional(),
    open: timeOfDay,
    close: timeOfDay,
  })
  .refine((v) => v.open < v.close, {
    message: "Closing time must be after opening time.",
    path: ["close"],
  });

const closedDay = z.object({ closed: z.literal(true) });

/**
 * A 24-hour branch is `{ open: "00:00", close: "23:59" }`. An explicit
 * `isTwentyFourHours` flag was considered and rejected: it would be a second
 * source of truth for the same fact, and "which branches are 24/7" is still
 * outstanding with Francis — a data answer, not a schema one.
 */
export const dayHoursSchema = z.union([closedDay, openDay]);

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const hoursSchema = z.object({
  mon: dayHoursSchema,
  tue: dayHoursSchema,
  wed: dayHoursSchema,
  thu: dayHoursSchema,
  fri: dayHoursSchema,
  sat: dayHoursSchema,
  sun: dayHoursSchema,
});

export type DayHours = z.infer<typeof dayHoursSchema>;
export type Hours = z.infer<typeof hoursSchema>;
export type DayKey = (typeof DAYS)[number];

/** True when a day's hours span effectively the whole day. */
export function isTwentyFourHours(day: DayHours): boolean {
  return !day.closed && day.open === "00:00" && day.close === "23:59";
}
