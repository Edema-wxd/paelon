import { z } from "zod";

import {
  antiSpamFields,
  bookingDate,
  dateOfBirth,
  email,
  marketingConsent,
  ndprConsent,
  nigerianPhone,
  optionalText,
  personName,
  slug,
} from "./primitives";

/**
 * Booking validation (master spec §7, backend spec §7).
 *
 * Two layers, deliberately:
 *  - `bookingStep*` schemas drive the six-step wizard's progressive validation.
 *    The frontend uses these for per-screen feedback.
 *  - `bookingSubmissionSchema` is the server's only source of truth. It
 *    validates the whole payload regardless of what the client thought was
 *    valid, and is the schema the route handler parses against.
 *
 * `bookingDate()` reads the clock, so it is built per-parse rather than at
 * module load — a long-lived serverless instance would otherwise pin "today"
 * to whenever the module was first imported.
 */

export const serviceFamilyValues = [
  "family_healthcare",
  "women_and_children",
  "specialist",
  "diagnostics",
] as const;

export const timeWindowValues = ["morning", "afternoon", "evening"] as const;

export const serviceFamilySchema = z.enum(serviceFamilyValues, {
  message: "Choose a service area.",
});

export const timeWindowSchema = z.enum(timeWindowValues, {
  message: "Choose a preferred time of day.",
});

/** Step 1 — branch. */
export const bookingStep1 = z.object({
  locationSlug: slug,
});

/** Step 2 — service family, optionally a specific service. */
export const bookingStep2 = z.object({
  serviceFamily: serviceFamilySchema,
  serviceSlug: slug.optional(),
});

/** Step 3 — preferred date and time window. */
export function bookingStep3(now: Date = new Date()) {
  return z.object({
    preferredDate: bookingDate(now),
    preferredTimeWindow: timeWindowSchema,
  });
}

/** Step 4 — patient details. */
export const bookingStep4 = z.object({
  patientName: personName,
  patientPhone: nigerianPhone,
  patientEmail: email,
  patientDob: dateOfBirth.optional(),
  existingPatient: z.boolean().default(false),
  /**
   * Optional free-text symptom description. This is health data — the most
   * sensitive NDPR category. Per Francis's decision it is collected and stored,
   * but never included in branch notification emails and never logged.
   * The UI must label it optional and non-clinical.
   */
  reasonForVisit: optionalText(1000),
});

/** Step 5 — HMO. "None / paying privately" is the absence of `hmoSlug`. */
export const bookingStep5 = z.object({
  hmoSlug: slug.optional(),
  hmoPlan: optionalText(120),
});

/** Step 6 — consent and review. */
export const bookingStep6 = z.object({
  consentNdpr: ndprConsent,
  consentMarketing: marketingConsent,
});

/** The six per-step schemas, in wizard order, for progressive validation. */
export const bookingStepSchemas = [
  bookingStep1,
  bookingStep2,
  bookingStep3(),
  bookingStep4,
  bookingStep5,
  bookingStep6,
] as const;

/**
 * Server-side truth. Build per-request via `bookingSubmissionSchema()` so the
 * date window is evaluated against the current clock.
 */
export function bookingSubmissionSchema(now: Date = new Date()) {
  return z
    .object({
      ...bookingStep1.shape,
      ...bookingStep2.shape,
      ...bookingStep3(now).shape,
      ...bookingStep4.shape,
      ...bookingStep5.shape,
      ...bookingStep6.shape,
      ...antiSpamFields,
    })
    .superRefine((v, ctx) => {
      // An HMO plan without an HMO is meaningless and usually means the user
      // changed their mind on step 5 without the field clearing.
      if (v.hmoPlan && !v.hmoSlug) {
        ctx.addIssue({
          code: "custom",
          path: ["hmoSlug"],
          message: "Choose your HMO, or clear the plan field.",
        });
      }
    });
}

export type BookingStep1 = z.infer<typeof bookingStep1>;
export type BookingStep2 = z.infer<typeof bookingStep2>;
export type BookingStep3 = z.infer<ReturnType<typeof bookingStep3>>;
export type BookingStep4 = z.infer<typeof bookingStep4>;
export type BookingStep5 = z.infer<typeof bookingStep5>;
export type BookingStep6 = z.infer<typeof bookingStep6>;

/** The full validated booking payload. The frontend's form contract. */
export type BookingSubmission = z.infer<
  ReturnType<typeof bookingSubmissionSchema>
>;
