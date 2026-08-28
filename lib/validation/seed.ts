import { z } from "zod";

import { hoursSchema } from "./hours";
import { serviceFamilyValues } from "./booking";
import { isoDate, slug } from "./primitives";

/**
 * Seed file contracts (backend spec §5).
 *
 * These are a relaxed mirror of the DB schema: relations are expressed as
 * human-writable slugs, which the loader resolves to UUIDs in a second pass.
 * A human edits these files, so the schemas are permissive about optionality
 * and strict about shape.
 *
 * `TODO(seed)` is a legitimate value in any text field — it marks a real
 * content gap. The seed reporter finds them; validation does not reject them.
 * Master spec §5 forbids inventing content, so a visible gap is the correct
 * state, not an error.
 */

export const TODO_SEED = "TODO(seed)";

/** Fields shared by every content seed record. */
const seedContentBase = {
  slug,
  published: z.boolean().default(true),
  order: z.number().int().default(0),
};

const nullableText = z.string().nullable().default(null);
const textArray = z.array(z.string()).default([]);

export const serviceSeedSchema = z.object({
  ...seedContentBase,
  name: z.string().min(1),
  family: z.enum(serviceFamilyValues),
  shortDescription: nullableText,
  longDescription: nullableText,
  whoItsFor: textArray,
  howToAccess: textArray,
  typicalWaitTime: z.string().nullable().default(null),
  whatToExpect: nullableText,
  featuredImage: z.string().nullable().default(null),
  galleryImages: textArray,
  locationSlugs: z.array(slug).default([]),
  relatedSlugs: z.array(slug).default([]),
});

export const doctorSeedSchema = z.object({
  ...seedContentBase,
  name: z.string().min(1),
  title: nullableText,
  qualifications: textArray,
  yearsExperience: z.number().int().nullable().default(null),
  specialties: textArray,
  languagesSpoken: textArray,
  bio: nullableText,
  headshot: z.string().nullable().default(null),
  inHouse: z.boolean().default(true),
  visiting: z.boolean().default(false),
  locationSlugs: z.array(slug).default([]),
});

export const locationSeedSchema = z.object({
  ...seedContentBase,
  name: z.string().min(1),
  addressLine1: nullableText,
  addressLine2: z.string().nullable().default(null),
  city: nullableText,
  state: nullableText,
  country: z.string().default("Nigeria"),
  latitude: z.number().nullable().default(null),
  longitude: z.number().nullable().default(null),
  phone: nullableText,
  whatsapp: z.string().nullable().default(null),
  emergencyLine: nullableText,
  hours: hoursSchema.nullable().default(null),
  parkingInfo: z.string().nullable().default(null),
  accessibilityNotes: z.string().nullable().default(null),
  heroImage: z.string().nullable().default(null),
  galleryImages: textArray,
  bookingEmail: z.string().nullable().default(null),
});

export const hmoSeedSchema = z.object({
  ...seedContentBase,
  name: z.string().min(1),
  logo: z.string().nullable().default(null),
  coverageNotes: z.string().nullable().default(null),
  copayApplies: z.boolean().default(false),
  planNotes: z.string().nullable().default(null),
  aliases: textArray,
  locationSlugs: z.array(slug).default([]),
});

export const testimonialSeedSchema = z.object({
  ...seedContentBase,
  patientName: z.string().min(1),
  nameFormat: z.enum(["full", "first_only", "initials"]).default("full"),
  avatar: z.string().nullable().default(null),
  quote: nullableText,
  serviceSlug: slug.nullable().default(null),
  locationSlug: slug.nullable().default(null),
  dateGiven: isoDate.nullable().default(null),
  featured: z.boolean().default(false),
  /**
   * Defaults to false, and public reads require true. A testimonial with no
   * recorded consent stays invisible rather than shipping on an assumption.
   */
  consentGiven: z.boolean().default(false),
});

export const authorSeedSchema = z.object({
  ...seedContentBase,
  name: z.string().min(1),
  role: nullableText,
  bio: nullableText,
  headshot: z.string().nullable().default(null),
  doctorSlug: slug.nullable().default(null),
});

export const blogPostSeedSchema = z.object({
  ...seedContentBase,
  title: z.string().min(1),
  excerpt: nullableText,
  body: nullableText,
  heroImage: z.string().nullable().default(null),
  authorSlug: slug,
  category: z.enum([
    "seasonal_alerts",
    "family_health",
    "women_and_children",
    "corporate_wellness",
  ]),
  tags: textArray,
  publishedAt: z.string().nullable().default(null),
  relatedSlugs: z.array(slug).default([]),
});

export const awardSeedSchema = z.object({
  ...seedContentBase,
  name: z.string().min(1),
  awardingBody: nullableText,
  year: z.number().int(),
  description: nullableText,
  logo: z.string().nullable().default(null),
  certificateImage: z.string().nullable().default(null),
  externalLink: z.string().nullable().default(null),
});

export const faqSeedSchema = z.object({
  ...seedContentBase,
  question: z.string().min(1),
  answer: nullableText,
  category: z.enum([
    "general",
    "booking",
    "services",
    "insurance",
    "emergencies",
  ]),
});

export type ServiceSeed = z.infer<typeof serviceSeedSchema>;
export type DoctorSeed = z.infer<typeof doctorSeedSchema>;
export type LocationSeed = z.infer<typeof locationSeedSchema>;
export type HmoSeed = z.infer<typeof hmoSeedSchema>;
export type TestimonialSeed = z.infer<typeof testimonialSeedSchema>;
export type AuthorSeed = z.infer<typeof authorSeedSchema>;
export type BlogPostSeed = z.infer<typeof blogPostSeedSchema>;
export type AwardSeed = z.infer<typeof awardSeedSchema>;
export type FaqSeed = z.infer<typeof faqSeedSchema>;
