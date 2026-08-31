import { z } from "zod";

import {
  antiSpamFields,
  email,
  ndprConsent,
  nigerianPhone,
  personName,
  slug,
} from "./primitives";

/** Contact form (master spec §6 `/contact`). */
export const contactSchema = z.object({
  name: personName,
  email,
  /** Optional — an email address is enough to reply. */
  phone: z
    .union([nigerianPhone, z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  subject: z
    .string()
    .trim()
    .min(3, "Enter a subject of at least 3 characters.")
    .max(150, "Subject must be 150 characters or fewer."),
  message: z
    .string()
    .trim()
    .min(10, "Enter a message of at least 10 characters.")
    .max(4000, "Message must be 4000 characters or fewer."),
  /** Which branch the enquiry is about, if the user picked one. */
  locationSlug: slug.optional(),
  consentNdpr: ndprConsent,
  ...antiSpamFields,
});

export type ContactSubmissionInput = z.infer<typeof contactSchema>;
