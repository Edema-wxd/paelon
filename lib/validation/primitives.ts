import { z } from "zod";

/**
 * Shared validation primitives. These are the contract the frontend builds
 * forms against, so their messages are user-facing copy, not developer notes.
 */

/** The hospital's operating timezone. All date logic is anchored here. */
export const HOSPITAL_TIMEZONE = "Africa/Lagos";

/**
 * How far ahead a booking may be requested, in days.
 *
 * Francis's decision: the server accepts 90 days; the date picker showing 7
 * days out is a UX constraint only. Widening the picker later needs no server
 * change (resolves the master spec §7 contradiction).
 */
export const BOOKING_MAX_DAYS_AHEAD = 90;

/* -------------------------------------------------------------------------- */
/* Nigerian phone numbers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Nigerian mobile/landline numbers, normalised to E.164.
 *
 * Hand-rolled rather than pulling in `libphonenumber-js`: the master spec §2
 * dependency list has no phone library, the accepted format space here is
 * small, and a dependency addition needs approval anyway.
 *
 * Accepted, with or without spaces, hyphens, or brackets:
 *   0XXXXXXXXXX      11 digits, national trunk form   -> +234XXXXXXXXXX
 *   234XXXXXXXXXX    13 digits, country code, no plus -> +234XXXXXXXXXX
 *   +234XXXXXXXXXX   already E.164                    -> unchanged
 *
 * The subscriber number is always 10 digits and never starts with 0.
 */
export function normaliseNigerianPhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, "");

  // Reject anything that is not an optional leading + followed by digits, so
  // that letters or stray symbols never slip through the branches below.
  if (!/^\+?\d+$/.test(cleaned)) return null;

  const digits = cleaned.replace(/^\+/, "");

  let subscriber: string | null = null;

  if (digits.length === 11 && digits.startsWith("0")) {
    subscriber = digits.slice(1);
  } else if (digits.length === 13 && digits.startsWith("234")) {
    subscriber = digits.slice(3);
  } else if (digits.length === 10 && !digits.startsWith("0")) {
    // Bare subscriber number, as typed into an input already showing "+234".
    subscriber = digits;
  }

  if (subscriber === null) return null;
  if (subscriber.startsWith("0")) return null;

  return `+234${subscriber}`;
}

/**
 * Nigerian phone. Validates and normalises in one step, so anything downstream
 * of a parse is guaranteed E.164 — dedupe and WhatsApp delivery both depend on
 * a single canonical stored format.
 */
export const nigerianPhone = z
  .string()
  .trim()
  .min(1, "Enter a phone number.")
  .transform((value, ctx) => {
    const normalised = normaliseNigerianPhone(value);
    if (normalised === null) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid Nigerian phone number, e.g. 0801 234 5678.",
      });
      return z.NEVER;
    }
    return normalised;
  });

/* -------------------------------------------------------------------------- */
/* Email                                                                      */
/* -------------------------------------------------------------------------- */

/** Email, trimmed and lowercased so stored values dedupe reliably. */
export const email = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Today's date in `Africa/Lagos`, as `YYYY-MM-DD`.
 *
 * Server-side `new Date()` is UTC. At 23:30 WAT it is already tomorrow in UTC,
 * so a naive comparison rejects a valid booking for "tomorrow" as being in the
 * past — and a booking for today as being in the future. Formatting through
 * `Intl` in the hospital's timezone is the only reliable way to ask "what day
 * is it *there*" without a tz database dependency.
 */
export function todayInLagos(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOSPITAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we store.
  return parts;
}

/** Add `days` to a `YYYY-MM-DD` string, staying in calendar-date space. */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  // Midday UTC avoids any chance of a DST or rounding shift moving the date.
  const base = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
  const shifted = new Date(base + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/** A calendar date in `YYYY-MM-DD` form that is also a real date. */
export const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date as YYYY-MM-DD.")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, "That date does not exist.");

/**
 * A booking date: today or later in Lagos, and no more than
 * `BOOKING_MAX_DAYS_AHEAD` out.
 *
 * `now` is injectable so the timezone boundary cases are testable without
 * faking the system clock.
 */
export function bookingDate(now: Date = new Date()) {
  return isoDate.superRefine((value, ctx) => {
    const today = todayInLagos(now);
    const latest = addDaysToIsoDate(today, BOOKING_MAX_DAYS_AHEAD);

    // ISO date strings compare correctly as strings — no Date needed.
    if (value < today) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a date from today onwards.",
      });
    } else if (value > latest) {
      ctx.addIssue({
        code: "custom",
        message: `Choose a date within the next ${BOOKING_MAX_DAYS_AHEAD} days.`,
      });
    }
  });
}

/** Date of birth: a real past date, not absurdly old. */
export const dateOfBirth = isoDate.superRefine((value, ctx) => {
  const today = todayInLagos();
  if (value > today) {
    ctx.addIssue({
      code: "custom",
      message: "Date of birth cannot be in the future.",
    });
  } else if (value < "1900-01-01") {
    ctx.addIssue({ code: "custom", message: "Enter a valid date of birth." });
  }
});

/* -------------------------------------------------------------------------- */
/* Consent                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * NDPR consent (master spec §14). `literal(true)` rather than `boolean()`: an
 * unticked box must fail validation, not submit as `false`. Never pre-checked
 * in the UI.
 */
export const ndprConsent = z.literal(true, {
  message: "Please confirm you agree to the privacy policy.",
});

/** Optional marketing opt-in. Genuinely a boolean — declining is valid. */
export const marketingConsent = z.boolean().default(false);

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

/** Lowercase kebab-case slug. */
export const slug = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug.");

/** Person's name, per master spec §7 validation rules. */
export const personName = z
  .string()
  .trim()
  .min(2, "Enter a name of at least 2 characters.")
  .max(100, "Name must be 100 characters or fewer.");

/**
 * Anti-spam fields present on every public form (backend spec §12). No CAPTCHA
 * — it is an accessibility and performance cost (master spec §12/§13).
 *
 * `website` is a hidden input a human never sees; a bot fills it in.
 * `formRenderedAt` is an epoch-ms stamp written when the form mounts. Both are
 * checked in `lib/spam.ts`, not here — a bot submission returns success rather
 * than a validation error, so the bot learns nothing.
 */
export const antiSpamFields = {
  website: z.string().max(0).optional(),
  formRenderedAt: z.number().int().positive().optional(),
};

/** Strip nullish and empty strings down to `undefined`. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();
