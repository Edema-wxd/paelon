import { z } from "zod";

import { serviceFamilyValues } from "./booking";
import { hoursSchema } from "./hours";
import { isoDate, slug } from "./primitives";

/**
 * Seed file contracts (backend spec §5).
 *
 * Keys are `snake_case`, mirroring the database columns, which is what the
 * files in `/seed` already use and what master spec §5 means by "structure
 * mirrors the schema". The loader maps them onto Drizzle's camelCase property
 * names in one place.
 *
 * Relations are expressed as human-writable slugs (`location_slugs`,
 * `service_slug`, …) and resolved to UUIDs by the loader's second pass. Unknown
 * keys are stripped rather than rejected, so a legacy field left in a file does
 * not block a seed run.
 *
 * `TODO(seed)` is a legitimate value in any text field — it marks a real
 * content gap, and `npm run seed:report` lists them. Validation does not reject
 * it: master spec §5 forbids inventing content, so a visible gap is the correct
 * state rather than an error.
 */

export const TODO_SEED = "TODO(seed)";

/** Columns every content seed record carries. */
const base = {
  slug,
  published: z.boolean().default(true),
  order: z.number().int().default(0),
};

const nullableText = z.string().nullable().default(null);
const textArray = z.array(z.string()).default([]);
const slugArray = z.array(slug).default([]);

export const serviceSeedSchema = z.object({
  ...base,
  name: z.string().min(1),
  family: z.enum(serviceFamilyValues),
  short_description: nullableText,
  long_description: nullableText,
  who_its_for: textArray,
  how_to_access: textArray,
  typical_wait_time: nullableText,
  what_to_expect: nullableText,
  featured_image: nullableText,
  gallery_images: textArray,
  location_slugs: slugArray,
  related_slugs: slugArray,
});

export const doctorSeedSchema = z.object({
  ...base,
  name: z.string().min(1),
  title: nullableText,
  qualifications: textArray,
  years_experience: z.number().int().nullable().default(null),
  specialties: textArray,
  languages_spoken: textArray,
  bio: nullableText,
  headshot: nullableText,
  in_house: z.boolean().default(true),
  visiting: z.boolean().default(false),
  location_slugs: slugArray,
});

export const locationSeedSchema = z.object({
  ...base,
  name: z.string().min(1),
  address_line_1: nullableText,
  address_line_2: nullableText,
  city: nullableText,
  state: nullableText,
  country: z.string().default("Nigeria"),
  latitude: z.number().nullable().default(null),
  longitude: z.number().nullable().default(null),
  phone: nullableText,
  whatsapp: nullableText,
  emergency_line: nullableText,
  hours: hoursSchema.nullable().default(null),
  parking_info: nullableText,
  accessibility_notes: nullableText,
  hero_image: nullableText,
  gallery_images: textArray,
  booking_email: nullableText,
});

export const hmoSeedSchema = z.object({
  ...base,
  name: z.string().min(1),
  logo: nullableText,
  coverage_notes: nullableText,
  copay_applies: z.boolean().default(false),
  plan_notes: nullableText,
  aliases: textArray,
  location_slugs: slugArray,
});

export const testimonialSeedSchema = z.object({
  ...base,
  patient_name: z.string().min(1),
  name_format: z.enum(["full", "first_only", "initials"]).default("full"),
  avatar: nullableText,
  quote: nullableText,
  service_slug: slug.nullable().default(null),
  location_slug: slug.nullable().default(null),
  date_given: isoDate.nullable().default(null),
  featured: z.boolean().default(false),
  /**
   * Defaults to false, and public reads require true. A testimonial with no
   * recorded consent stays invisible rather than shipping on an assumption.
   */
  consent_given: z.boolean().default(false),
});

export const authorSeedSchema = z.object({
  ...base,
  name: z.string().min(1),
  role: nullableText,
  bio: nullableText,
  headshot: nullableText,
  doctor_slug: slug.nullable().default(null),
});

export const blogPostSeedSchema = z.object({
  ...base,
  title: z.string().min(1),
  excerpt: nullableText,
  body: nullableText,
  hero_image: nullableText,
  author_slug: slug,
  category: z.enum([
    "seasonal_alerts",
    "family_health",
    "women_and_children",
    "corporate_wellness",
  ]),
  tags: textArray,
  published_at: z.string().nullable().default(null),
  related_slugs: slugArray,
});

export const awardSeedSchema = z.object({
  ...base,
  name: z.string().min(1),
  awarding_body: nullableText,
  year: z.number().int(),
  description: nullableText,
  logo: nullableText,
  certificate_image: nullableText,
  external_link: nullableText,
});

export const faqSeedSchema = z.object({
  ...base,
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

/** Every seed file the loader and reporter know about. */
export const SEED_FILES = [
  { file: "locations.json", schema: locationSeedSchema },
  { file: "services.json", schema: serviceSeedSchema },
  { file: "doctors.json", schema: doctorSeedSchema },
  { file: "hmos.json", schema: hmoSeedSchema },
  { file: "authors.json", schema: authorSeedSchema },
  { file: "blog-posts.json", schema: blogPostSeedSchema },
  { file: "testimonials.json", schema: testimonialSeedSchema },
  { file: "awards.json", schema: awardSeedSchema },
  { file: "faqs.json", schema: faqSeedSchema },
] as const;
