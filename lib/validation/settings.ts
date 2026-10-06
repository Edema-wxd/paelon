import { z } from "zod";

import { normaliseNigerianPhone } from "@/lib/validation/primitives";

/**
 * `/admin/settings` input (Phase 2, decision C2 option B).
 *
 * The scope of this schema is the scope of the feature: two non-secret display
 * values. C2 turned down runtime integration toggles, so there is deliberately
 * no place here for `RESEND_ENABLED`, an API key, or the emergency line — that
 * last one is read at build time by `lib/emergency.ts` because the client-side
 * error boundaries cannot query the database.
 *
 * Both fields are optional and clearable. An empty input is not a validation
 * error, it is the operator saying "we have not confirmed this yet", which is
 * the state the site already ships in: readers fall back to their documented
 * `TODO(seed)` constant. That is why neither field is `.min(1)`.
 */

/**
 * Upper bound on the stated turnaround, in hours.
 *
 * Two working weeks. Not a policy — a typo guard. Someone meaning 4 and typing
 * 400 would otherwise publish "we will contact you within 400 business hours"
 * to every form on a hospital site, and the database CHECK only rejects zero
 * and negatives.
 */
export const RESPONSE_TIME_MAX_HOURS = 80;

/**
 * Hours, or null when cleared.
 *
 * Takes the raw string a form sends rather than a coerced number: `z.coerce`
 * turns "" into 0 and "abc" into NaN, and both need distinguishing from a
 * genuine clear.
 */
const responseTimeHours = z
  .string()
  .trim()
  .transform((value, ctx): number | null => {
    if (value === "") return null;

    if (!/^\d+$/.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a whole number of hours, or leave it empty.",
      });
      return z.NEVER;
    }

    const hours = Number(value);
    if (hours < 1) {
      ctx.addIssue({
        code: "custom",
        message: "Enter at least 1 hour, or leave it empty.",
      });
      return z.NEVER;
    }
    if (hours > RESPONSE_TIME_MAX_HOURS) {
      ctx.addIssue({
        code: "custom",
        message: `Enter ${RESPONSE_TIME_MAX_HOURS} hours or fewer. Longer than that, say it in words on the page instead.`,
      });
      return z.NEVER;
    }

    return hours;
  });

/**
 * WhatsApp number, normalised to E.164, or null when cleared.
 *
 * Normalised on the way in rather than on the way out, so every reader gets one
 * canonical format — `toWhatsAppHref` strips to digits and a stored
 * "0801 234 5678" would otherwise build a `wa.me` link missing its country
 * code, which fails silently in the browser rather than at the boundary.
 */
const whatsappNumber = z
  .string()
  .trim()
  .transform((value, ctx): string | null => {
    if (value === "") return null;

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

export const siteSettingsSchema = z.object({
  responseTimeHours,
  whatsappNumber,
});

export type SiteSettingsInput = z.output<typeof siteSettingsSchema>;
