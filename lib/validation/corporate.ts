import { z } from "zod";

import {
  antiSpamFields,
  email,
  ndprConsent,
  nigerianPhone,
  optionalText,
  personName,
} from "./primitives";

export const companySizeValues = [
  "1_50",
  "51_200",
  "201_500",
  "501_1000",
  "1000_plus",
] as const;

export const companySizeSchema = z.enum(companySizeValues, {
  message: "Choose a company size.",
});

/** Corporate healthcare enquiry (master spec §6 `/for-corporates`). */
export const corporateSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Enter your company name.")
    .max(150, "Company name must be 150 characters or fewer."),
  contactName: personName,
  contactEmail: email,
  contactPhone: nigerianPhone,
  companySize: companySizeSchema,
  sector: z
    .string()
    .trim()
    .min(2, "Enter your sector.")
    .max(100, "Sector must be 100 characters or fewer."),
  currentProvider: optionalText(150),
  requirements: z
    .string()
    .trim()
    .min(10, "Tell us a little about what you need.")
    .max(4000, "Requirements must be 4000 characters or fewer."),
  consentNdpr: ndprConsent,
  ...antiSpamFields,
});

export type CorporateEnquiryInput = z.infer<typeof corporateSchema>;
